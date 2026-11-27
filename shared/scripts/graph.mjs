// Minimal Meta Graph API client for Facebook Pages and Instagram (Facebook Login). Never prints tokens.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export const GRAPH_URL = "https://graph.facebook.com";
export const DEFAULT_GRAPH_VERSION = "v24.0";

export class GraphError extends Error {
  constructor(message, { status, code, subcode } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

export function redact(text, secrets) {
  let result = String(text);
  for (const secret of secrets.filter((value) => value && value.length > 8)) result = result.split(secret).join("[redacted]");
  return result.replace(/access_token=[^&\s"]+/g, "access_token=[redacted]");
}

export class GraphClient {
  constructor({ token, version = DEFAULT_GRAPH_VERSION, fetchImpl = fetch, baseUrl = GRAPH_URL }) {
    if (!token) throw new GraphError("missing access token");
    this.token = token;
    this.originalToken = token;
    this.version = version;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
  }

  endpoint(path) {
    return /^https?:/.test(path) ? path : `${this.baseUrl}/${this.version}/${path.replace(/^\//, "")}`;
  }

  async request(method, path, { params = {}, form, body, headers = {} } = {}) {
    const url = new URL(this.endpoint(path));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const init = { method, headers: { authorization: `Bearer ${this.token}`, ...headers } };
    if (form) init.body = form;
    else if (body !== undefined) init.body = body;
    let response;
    try {
      response = await this.fetch(url.toString(), init);
    } catch (error) {
      throw new GraphError(`Graph API network error on ${method} ${url.pathname}: ${redact(error.message, [this.token, this.originalToken])}`);
    }
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!response.ok || data.error) {
      const error = data.error ?? {};
      const message = `Graph API ${response.status} ${method} ${url.pathname}: ${error.message ?? data.raw ?? "error without message"} (code ${error.code ?? "?"}, subcode ${error.error_subcode ?? "?"})`;
      throw new GraphError(redact(message, [this.token, this.originalToken]), { status: response.status, code: error.code, subcode: error.error_subcode });
    }
    return data;
  }

  get(path, params = {}) {
    return this.request("GET", path, { params });
  }

  post(path, fields = {}) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null) form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    return this.request("POST", path, { form, headers: { "content-type": "application/x-www-form-urlencoded" } });
  }

  postFile(path, fields, { field, filePath, contentType }) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== null) form.set(key, String(value));
    form.set(field, new Blob([readFileSync(filePath)], { type: contentType }), basename(filePath));
    return this.request("POST", path, { form });
  }

  /** Swaps a user token for the Page token when the Graph returns one; keeps a Page token as is. */
  async usePageToken(pageId) {
    try {
      const data = await this.get(pageId, { fields: "access_token" });
      if (data.access_token) this.token = data.access_token;
    } catch (error) {
      if (!(error instanceof GraphError)) throw error;
    }
    return this;
  }

  async instagramUserId(pageId) {
    const data = await this.get(pageId, { fields: "instagram_business_account" });
    const id = data.instagram_business_account?.id;
    if (!id) throw new GraphError(`Page ${pageId} returned no instagram_business_account: link an Instagram professional account to the Page and use a token with instagram_basic and instagram_content_publish (or set INSTAGRAM_USER_ID)`);
    return id;
  }
}

export function graphEnv(env = process.env) {
  return { pageId: env.FACEBOOK_PAGE_ID, token: env.FACEBOOK_PAGE_ACCESS_TOKEN, version: env.FACEBOOK_GRAPH_VERSION || DEFAULT_GRAPH_VERSION };
}
