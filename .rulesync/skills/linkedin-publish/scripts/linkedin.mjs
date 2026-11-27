// Minimal LinkedIn Community Management API client (versioned REST API) for posting as an organization Page.
// Counts every request so callers can stay inside the app's daily call limit. Never prints tokens.
export const API = "https://api.linkedin.com/rest";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const DEFAULT_VERSION = "202610";
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

export class LinkedInError extends Error {
  constructor(message, { status, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

export function linkedinEnv(env = process.env) {
  const values = {
    organizationId: env.LINKEDIN_ORGANIZATION_ID,
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    refreshToken: env.LINKEDIN_REFRESH_TOKEN,
    version: env.LINKEDIN_API_VERSION || DEFAULT_VERSION,
  };
  const missing = [["LINKEDIN_ORGANIZATION_ID", values.organizationId], ["LINKEDIN_CLIENT_ID", values.clientId], ["LINKEDIN_CLIENT_SECRET", values.clientSecret], ["LINKEDIN_REFRESH_TOKEN", values.refreshToken]].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new LinkedInError(`missing environment variables: ${missing.join(", ")}`);
  return values;
}

/** Exchanges the refresh token for a 60-day access token; warns (without values) when LinkedIn rotates it. */
export async function accessToken({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new LinkedInError(`LinkedIn OAuth ${response.status}: ${body.error ?? "error"}${body.error_description ? ` (${body.error_description})` : ""}`, { status: response.status });
  return { token: body.access_token, rotated: Boolean(body.refresh_token && body.refresh_token !== refreshToken), refreshExpiresIn: body.refresh_token_expires_in ?? null };
}

/**
 * Commentary in LinkedIn's "little text" format: reserved characters are escaped, and #Tag words become hashtag
 * templates. The same function builds the text that read-back compares, so a duplicate check matches exactly.
 */
export function littleText(text) {
  return String(text)
    .replace(RESERVED, (char) => `\\${char}`)
    .replace(/(^|\s)\\#((?:[\p{L}\p{N}]|\\_)+)/gu, (_, space, tag) => `${space}{hashtag|\\#|${tag.replace(/\\_/g, "_")}}`);
}

export class LinkedInClient {
  constructor({ token, version = DEFAULT_VERSION, fetchImpl = fetch, organizationId }) {
    this.token = token;
    this.version = version;
    this.fetch = fetchImpl;
    this.organization = `urn:li:organization:${organizationId}`;
    this.calls = 0;
  }

  headers(extra = {}) {
    return { authorization: `Bearer ${this.token}`, "linkedin-version": this.version, "x-restli-protocol-version": "2.0.0", ...extra };
  }

  async request(method, url, { body, headers = {}, raw = false } = {}) {
    // The budget is checked on every call, media status polls included, before anything is sent.
    if (this.maxCalls !== undefined && this.calls >= this.maxCalls) {
      const error = new LinkedInError(`call budget exhausted after ${this.calls} calls; the item waits for the next run`);
      error.budget = true;
      throw error;
    }
    this.calls += 1;
    let response;
    try {
      response = await this.fetch(url, { method, headers: raw ? headers : this.headers({ ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }), body: raw || body === undefined ? body : JSON.stringify(body) });
    } catch (error) {
      throw new LinkedInError(`LinkedIn network error on ${method} ${new URL(url).pathname}: ${error.message}`, { network: true });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = text.slice(0, 300);
      try {
        message = JSON.parse(text).message ?? message;
      } catch {
        // keep the raw text
      }
      throw new LinkedInError(`LinkedIn API ${response.status} ${method} ${new URL(url).pathname}: ${message || "error"}`, { status: response.status });
    }
    return response;
  }

  async json(method, path, body, headers) {
    const response = await this.request(method, `${API}${path}`, { body, headers });
    const text = await response.text();
    return { data: text ? JSON.parse(text) : {}, headers: response.headers };
  }

  async uploadImage(bytes) {
    const { data } = await this.json("POST", "/images?action=initializeUpload", { initializeUploadRequest: { owner: this.organization } });
    const { uploadUrl, image } = data.value ?? {};
    if (!uploadUrl || !image) throw new LinkedInError("image initializeUpload returned no uploadUrl");
    await this.request("PUT", uploadUrl, { body: bytes, headers: { authorization: `Bearer ${this.token}`, "content-type": "application/octet-stream" }, raw: true });
    return image;
  }

  async uploadVideo(bytes) {
    const { data } = await this.json("POST", "/videos?action=initializeUpload", { initializeUploadRequest: { owner: this.organization, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } });
    const { video, uploadToken = "", uploadInstructions = [] } = data.value ?? {};
    if (!video || !uploadInstructions.length) throw new LinkedInError("video initializeUpload returned no upload instructions");
    const etags = [];
    for (const part of uploadInstructions) {
      const response = await this.request("PUT", part.uploadUrl, { body: bytes.subarray(part.firstByte, part.lastByte + 1), headers: { "content-type": "application/octet-stream" }, raw: true });
      const etag = response.headers.get("etag");
      if (!etag) throw new LinkedInError(`video part ${part.firstByte}-${part.lastByte} upload returned no ETag`);
      etags.push(etag);
    }
    await this.json("POST", "/videos?action=finalizeUpload", { finalizeUploadRequest: { video, uploadToken, uploadedPartIds: etags } });
    return video;
  }

  /** Waits until an image or video URN is AVAILABLE. */
  async waitAvailable(urn, { pollMs, timeoutMs, sleep }) {
    const kind = urn.startsWith("urn:li:video:") ? "videos" : "images";
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { data } = await this.json("GET", `/${kind}/${encodeURIComponent(urn)}`);
      if (data.status === "AVAILABLE") return;
      if (/FAIL/.test(data.status ?? "")) throw new LinkedInError(`${urn} processing failed (${data.status})`);
      if (Date.now() > deadline) throw new LinkedInError(`${urn} not available after ${Math.round(timeoutMs / 1000)} s (${data.status})`);
      await sleep(pollMs);
    }
  }

  async createPost(post) {
    const { headers } = await this.json("POST", "/posts", { author: this.organization, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...post });
    const id = headers.get("x-restli-id") ?? headers.get("x-linkedin-id");
    if (!id) throw new LinkedInError("post created without an id header");
    return id;
  }

  /** The organization's latest posts (needs r_organization_social), for the duplicate check. */
  async recentPosts(count = 20) {
    const { data } = await this.json("GET", `/posts?author=${encodeURIComponent(this.organization)}&q=author&count=${count}&sortBy=LAST_MODIFIED`, undefined, { "x-restli-method": "FINDER" });
    return data.elements ?? [];
  }
}

export const postUrl = (urn) => `https://www.linkedin.com/feed/update/${urn}/`;
