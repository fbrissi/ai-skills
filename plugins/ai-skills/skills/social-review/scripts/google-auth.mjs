// Google OAuth: exchange a refresh token for an access token. Never logs tokens.
// Env: <PREFIX>_CLIENT_ID, <PREFIX>_CLIENT_SECRET, <PREFIX>_REFRESH_TOKEN (for example GOOGLE_DRIVE_ or YOUTUBE_).
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function googleCredentials(prefix, env = process.env) {
  const values = { clientId: env[`${prefix}CLIENT_ID`], clientSecret: env[`${prefix}CLIENT_SECRET`], refreshToken: env[`${prefix}REFRESH_TOKEN`] };
  const missing = Object.entries({ CLIENT_ID: values.clientId, CLIENT_SECRET: values.clientSecret, REFRESH_TOKEN: values.refreshToken })
    .filter(([, value]) => !value)
    .map(([key]) => `${prefix}${key}`);
  if (missing.length) throw new GoogleError(`missing environment variables: ${missing.join(", ")}`);
  return values;
}

export async function accessToken({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new GoogleError(`Google OAuth ${response.status}: ${body.error ?? "error"}${body.error_description ? ` (${body.error_description})` : ""}`, response.status);
  }
  return body.access_token;
}

/** JSON request with a bearer token; throws GoogleError with the API message (never the token). */
export async function googleJson(fetchImpl, token, url, { method = "GET", body, headers = {} } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return {};
  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) {
    const message = data?.error?.message ?? data?.error ?? text.slice(0, 300);
    throw new GoogleError(`Google API ${response.status} ${method} ${new URL(url).pathname}: ${message}`, response.status);
  }
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}
