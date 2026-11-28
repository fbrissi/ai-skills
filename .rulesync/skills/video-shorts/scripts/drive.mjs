#!/usr/bin/env node
// Google Drive helper for the drive.file scope: the app sees only files and folders it created.
// Auth: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN (OAuth, scope drive.file).
// For a public folder the app did not create, GOOGLE_API_KEY lists and downloads it instead.
// Usage:
//   drive.mjs ensure-folder --path "<Root>/<Platform>/<YYYY-MM-DD HH-mm>" [--share]
//   drive.mjs upload <file> --folder <id> [--name <name>] [--share]
//   drive.mjs list --folder <id>
//   drive.mjs download <fileId> --out <path>
//   drive.mjs download-folder --folder <id> --out <dir> [--match <regex>]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { accessToken, googleCredentials, googleJson, GoogleError } from "./google-auth.mjs";
import { isMain } from "./social-manifest.mjs";

export const API = "https://www.googleapis.com/drive/v3";
export const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mov": "video/quicktime", ".json": "application/json", ".md": "text/markdown", ".txt": "text/plain", ".srt": "application/x-subrip", ".vtt": "text/vtt", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

const quote = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

export class Drive {
  constructor({ token = null, apiKey = null, fetchImpl = fetch } = {}) {
    this.token = token;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  static async fromEnv(env = process.env, fetchImpl = fetch) {
    if (env.GOOGLE_DRIVE_REFRESH_TOKEN) return new Drive({ token: await accessToken(googleCredentials("GOOGLE_DRIVE_", env), fetchImpl), fetchImpl });
    if (env.GOOGLE_API_KEY) return new Drive({ apiKey: env.GOOGLE_API_KEY, fetchImpl });
    throw new GoogleError("set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN (or GOOGLE_API_KEY for a public folder)");
  }

  url(base, params = {}) {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (this.apiKey) url.searchParams.set("key", this.apiKey);
    return url.toString();
  }

  async json(url, options = {}) {
    if (this.token) return googleJson(this.fetch, this.token, url, options);
    const response = await this.fetch(url, { method: options.method ?? "GET" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new GoogleError(`Google API ${response.status}: ${data?.error?.message ?? "error"}`, response.status);
    return data;
  }

  async list(query, fields = "files(id,name,mimeType,md5Checksum,webViewLink,size)") {
    const files = [];
    let pageToken;
    do {
      const params = { q: query, fields: `nextPageToken,${fields}`, pageSize: "1000", spaces: "drive" };
      if (pageToken) params.pageToken = pageToken;
      const page = await this.json(this.url(`${API}/files`, params));
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async children(folderId) {
    return this.list(`${quote(folderId)} in parents and trashed = false`);
  }

  async findFolder(name, parentId) {
    const found = await this.list(`name = ${quote(name)} and mimeType = ${quote(FOLDER_MIME)} and ${quote(parentId)} in parents and trashed = false`, "files(id,name,webViewLink)");
    return found[0] ?? null;
  }

  async createFolder(name, parentId) {
    return this.json(this.url(`${API}/files`, { fields: "id,name,webViewLink" }), { method: "POST", body: { name, mimeType: FOLDER_MIME, parents: [parentId] } });
  }

  /** Folder for "A/B/C" under My Drive (or under parentId), creating missing folders. */
  async ensurePath(path, { parentId = "root" } = {}) {
    let parent = { id: parentId, webViewLink: null };
    for (const name of path.split("/").map((segment) => segment.trim()).filter(Boolean)) {
      parent = (await this.findFolder(name, parent.id)) ?? (await this.createFolder(name, parent.id));
    }
    return parent;
  }

  async share(fileId) {
    await this.json(this.url(`${API}/files/${fileId}/permissions`, { fields: "id" }), { method: "POST", body: { role: "reader", type: "anyone" } });
  }

  /** Uploads or replaces (same id, same link) a file by name in a folder; skips unchanged content. */
  async upload(localPath, folderId, { name = basename(localPath) } = {}) {
    const existing = (await this.list(`name = ${quote(name)} and ${quote(folderId)} in parents and trashed = false`))[0];
    const checksum = md5(localPath);
    if (existing && existing.md5Checksum === checksum) return { ...existing, unchanged: true };
    const metadata = existing ? { name } : { name, parents: [folderId] };
    const target = existing ? `${UPLOAD}/files/${existing.id}` : `${UPLOAD}/files`;
    const start = await this.fetch(this.url(target, { uploadType: "resumable", fields: "id,name,md5Checksum,webViewLink" }), {
      method: existing ? "PATCH" : "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": mimeFor(localPath) },
      body: JSON.stringify(metadata),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location) throw new GoogleError(`Drive upload start ${start.status} for ${name}`, start.status);
    const bytes = readFileSync(localPath);
    const done = await this.fetch(location, { method: "PUT", headers: { "content-type": mimeFor(localPath), "content-length": String(bytes.length) }, body: bytes });
    const file = await done.json().catch(() => ({}));
    if (!done.ok || !file.id) throw new GoogleError(`Drive upload ${done.status} for ${name}: ${file?.error?.message ?? "error"}`, done.status);
    return file;
  }

  async download(fileId, outPath) {
    const headers = this.token ? { authorization: `Bearer ${this.token}` } : {};
    const response = await this.fetch(this.url(`${API}/files/${fileId}`, { alt: "media" }), { headers });
    if (!response.ok) throw new GoogleError(`Drive download ${response.status} for ${fileId}`, response.status);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
    return outPath;
  }
}

export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

function flagsOf(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else flags[argv[i].slice(2)] = true;
  }
  return { positional, flags };
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout } = {}) {
  const { positional, flags } = flagsOf(argv);
  const [command, arg] = positional;
  const drive = await Drive.fromEnv(env, fetchImpl);
  const print = (value) => out.write(`${JSON.stringify(value, null, 2)}\n`);
  if (command === "ensure-folder") {
    const folder = await drive.ensurePath(flags.path);
    if (flags.share) await drive.share(folder.id);
    return print({ id: folder.id, url: folderUrl(folder.id) });
  }
  if (command === "upload") {
    const file = await drive.upload(resolve(arg), flags.folder, { name: flags.name });
    if (flags.share) await drive.share(file.id);
    return print({ id: file.id, url: fileUrl(file.id), unchanged: Boolean(file.unchanged) });
  }
  if (command === "list") return print(await drive.children(flags.folder));
  if (command === "download") return print({ path: await drive.download(arg, resolve(flags.out)) });
  if (command === "download-folder") {
    const match = flags.match ? new RegExp(flags.match, "i") : null;
    const files = (await drive.children(flags.folder)).filter((file) => file.mimeType !== FOLDER_MIME && (!match || match.test(file.name)));
    if (!files.length) throw new GoogleError("no files visible in that folder: with drive.file the app sees only files it uploaded (use drive.mjs upload), or share the folder publicly and set GOOGLE_API_KEY");
    const saved = [];
    const outDir = resolve(flags.out);
    for (const file of files) {
      const name = basename(String(file.name).replaceAll("\\", "/"));
      if (!name || name === "." || name === "..") throw new GoogleError(`unsafe file name in the folder: ${file.name}`);
      saved.push(await drive.download(file.id, join(outDir, name)));
    }
    return print({ files: saved });
  }
  throw new GoogleError("usage: drive.mjs <ensure-folder|upload|list|download|download-folder> ...");
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
