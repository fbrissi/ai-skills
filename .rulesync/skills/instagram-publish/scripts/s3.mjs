// S3-compatible PUT with AWS Signature V4 (Cloudflare R2 by default). No dependencies; never prints keys.
// Env: R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL, R2_REGION (default auto).
import { createHash, createHmac } from "node:crypto";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const encodeKey = (key) => key.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

export class S3Error extends Error {}

export function s3Config(env = process.env) {
  const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  const config = {
    endpoint: endpoint.replace(/\/$/, ""),
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBaseUrl: (env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
    region: env.R2_REGION || "auto",
  };
  const missing = [["R2_ACCOUNT_ID or R2_ENDPOINT", config.endpoint], ["R2_ACCESS_KEY_ID", config.accessKeyId], ["R2_SECRET_ACCESS_KEY", config.secretAccessKey], ["R2_BUCKET", config.bucket], ["R2_PUBLIC_BASE_URL", config.publicBaseUrl]]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) throw new S3Error(`missing environment variables: ${missing.join(", ")}`);
  return config;
}

/** Signed request headers for a path-style PUT. Exported for tests. */
export function signPut({ endpoint, accessKeyId, secretAccessKey, bucket, region }, key, body, contentType, now = new Date()) {
  const url = new URL(`${endpoint}/${bucket}/${encodeKey(key)}`);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { "content-type": contentType, host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonical = ["PUT", url.pathname, "", ...Object.keys(headers).sort().map((name) => `${name}:${headers[name]}`), "", signedHeaders, payloadHash].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const { host, ...sent } = headers;
  return { url: url.toString(), headers: { ...sent, authorization } };
}

export async function putObject(config, key, body, contentType, fetchImpl = fetch, now = new Date()) {
  const { url, headers } = signPut(config, key, body, contentType, now);
  const response = await fetchImpl(url, { method: "PUT", headers, body });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "error";
    throw new S3Error(`bucket upload ${response.status} for ${key}: ${code}`);
  }
  return `${config.publicBaseUrl}/${encodeKey(key)}`;
}
