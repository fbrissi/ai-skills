import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const NOW = new Date("2026-11-27T12:00:00-03:00");

/** fetch double: routes are [matcher(url, init) => boolean, responder(url, init) => Response | object]. */
export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body };
    calls.push(call);
    const route = routes.find(([match]) => match(call.url, call));
    if (!route) throw new Error(`unexpected request ${call.method} ${call.url}`);
    const result = await route[1](call.url, call);
    return result instanceof Response ? result : json(result);
  };
  impl.calls = calls;
  return impl;
}

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export function png(width, height) {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

export function jpeg(width, height) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}

export function tempDir(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "social-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

export function item(overrides = {}) {
  return {
    id: "2026-11-30-facebook-1",
    type: "photo",
    date: "2026-11-30",
    publish_at: "2026-11-30T12:30:00-03:00",
    scheduled: true,
    visibility: "public",
    title: null,
    caption: "Fechou o mês? Emita o lote: https://example.com/?utm_source=facebook&utm_medium=social&utm_campaign=organic-lote",
    description: null,
    hashtags: ["#NFSe"],
    tags: [],
    link: null,
    media: [{ path: "media/card.png", kind: "image", width: 1080, height: 1350 }],
    thumbnail: null,
    credits: null,
    synthetic_media: false,
    sources: ["docs/site.md"],
    ...overrides,
  };
}

export function manifest(platform, items, overrides = {}) {
  return {
    schema_version: 1,
    platform,
    batch_id: `2026-11-30-${platform}`,
    publication_date: "2026-11-30",
    timezone: "America/Sao_Paulo",
    language: "pt-BR",
    profile: null,
    created_at: "2026-11-27T12:00:00.000Z",
    generator: null,
    items,
    approval: { status: "approved", by: "reviewer", at: "2026-11-27T13:00:00.000Z", revision: 1 },
    review: { issue_number: 7, issue_url: null, revision: 1, drive_root_id: null, history: [] },
    state: {},
    ...overrides,
  };
}

export function writeManifest(dir, data) {
  const path = join(dir, "manifest.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export function sink() {
  const lines = [];
  return { write: (text) => lines.push(text), text: () => lines.join("") };
}
