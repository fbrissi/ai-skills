#!/usr/bin/env node
// Deterministic YouTube publisher (Data API v3) for an approved social manifest. Uploads each video with
// videos.insert (resumable), scheduled as private + publishAt or published with the item's visibility, then sets
// the thumbnail, playlist and captions when the item has them. State goes to the manifest right after the insert,
// so a re-run never uploads twice. Never prints tokens.
// Usage: publish-youtube.mjs <manifest.json> [--execute] [--now ISO] [--only <id>] [--retry <id,id>] [--daily-limit N]
// An upload without a response leaves the item "unknown" (the video may exist): it is skipped until --retry names it.
// Env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, YOUTUBE_DAILY_UPLOAD_LIMIT (default 100).
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { accessToken, googleCredentials, googleJson, GoogleError } from "./google-auth.mjs";
import { composeText, isDone, isMain, loadManifest, pendingItems, recordState, reportBlocked, resolveMediaPath, saveManifest, UncertainError, validateManifest } from "./social-manifest.mjs";

export const API = "https://www.googleapis.com/youtube/v3";
export const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
export const DEFAULT_DAILY_LIMIT = 100;

export class PublishError extends Error {}

export function videoResource(item, { language } = {}) {
  const snippet = {
    title: item.title,
    description: composeText(item, "youtube"),
    tags: item.tags?.length ? item.tags : undefined,
    categoryId: item.options?.category_id ?? "22",
    defaultLanguage: item.options?.default_language ?? language ?? undefined,
    defaultAudioLanguage: item.options?.default_language ?? language ?? undefined,
  };
  const status = {
    privacyStatus: item.scheduled ? "private" : item.visibility,
    selfDeclaredMadeForKids: item.options?.made_for_kids ?? false,
    containsSyntheticMedia: Boolean(item.synthetic_media),
  };
  if (item.scheduled) status.publishAt = new Date(item.publish_at).toISOString();
  return { snippet, status };
}

export function uploadsInLast24h(manifest, now) {
  return Object.values(manifest.state ?? {}).filter((entry) => ["scheduled", "published"].includes(entry.status) && now.getTime() - Date.parse(entry.at) < 24 * 3600 * 1000).length;
}

async function resumableUpload(fetchImpl, token, url, metadata, bytes, contentType) {
  const start = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": contentType, "x-upload-content-length": String(bytes.length) },
    body: JSON.stringify(metadata),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) {
    const data = await start.json().catch(() => ({}));
    throw new GoogleError(`YouTube upload start ${start.status}: ${data?.error?.message ?? "error"}`, start.status);
  }
  let done;
  try {
    done = await fetchImpl(location, { method: "PUT", headers: { "content-type": contentType, "content-length": String(bytes.length) }, body: bytes });
  } catch (error) {
    throw new UncertainError(`YouTube upload got no response: ${error.message}`);
  }
  const data = await done.json().catch(() => ({}));
  if (!done.ok || !data.id) throw new GoogleError(`YouTube upload ${done.status}: ${data?.error?.message ?? "error"}`, done.status);
  return data;
}

export async function insertVideo({ fetchImpl, token }, item, videoPath, language) {
  return resumableUpload(fetchImpl, token, `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, videoResource(item, { language }), readFileSync(videoPath), "video/*");
}

export async function setThumbnail({ fetchImpl, token }, videoId, path) {
  const type = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
  const response = await fetchImpl(`${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": type }, body: readFileSync(path) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new GoogleError(`thumbnails.set ${response.status}: ${data?.error?.message ?? "error"}`, response.status);
  }
}

export async function addToPlaylist({ fetchImpl, token }, videoId, playlistId) {
  return googleJson(fetchImpl, token, `${API}/playlistItems?part=snippet`, { method: "POST", body: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } } });
}

export async function insertCaptions({ fetchImpl, token }, videoId, path, language) {
  const boundary = `caption${Date.now()}`;
  const metadata = JSON.stringify({ snippet: { videoId, language, name: extname(path) === ".vtt" ? "Subtitles" : "", isDraft: false } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
    readFileSync(path),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetchImpl(`${UPLOAD}/captions?part=snippet&uploadType=multipart`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` }, body });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new GoogleError(`captions.insert ${response.status}: ${data?.error?.message ?? "error"}`, response.status);
  }
}

export async function publish(manifest, { manifestDir, manifestPath, api, execute, now = new Date(), only = null, retry = [], dailyLimit = DEFAULT_DAILY_LIMIT, out = process.stdout }) {
  const pending = pendingItems(manifest, { only, retry });
  const errors = validateManifest(manifest, { manifestDir, forPublish: execute, now }).filter((error) => !manifest.items.some((entry) => error.startsWith(`${entry.id}:`) && !pending.includes(entry)));
  if (manifest.platform !== "youtube") errors.unshift(`manifest platform is ${manifest.platform}, not youtube`);
  if (errors.length) throw new PublishError(`invalid batch:\n- ${errors.join("\n- ")}`);

  for (const item of manifest.items) if (isDone(manifest, item.id)) out.write(`already ${manifest.state[item.id].status}: ${item.id} (${manifest.state[item.id].remote_id})\n`);
  reportBlocked(manifest, out, retry);
  let used = uploadsInLast24h(manifest, now);
  for (const item of pending) {
    const when = item.scheduled ? `private until ${item.publish_at}` : item.visibility;
    if (!execute) {
      out.write(`dry run: ${item.id} ${item.type} ${when}${item.thumbnail ? " + thumbnail" : ""}${item.options?.playlist_id ? " + playlist" : ""}${item.options?.captions ? " + captions" : ""}\n`);
      continue;
    }
    if (used >= dailyLimit) {
      out.write(`daily upload limit reached (${used}/${dailyLimit}): ${item.id} waits for the next run\n`);
      break;
    }
    const video = item.media.find((media) => media.kind === "video");
    let inserted;
    try {
      inserted = await insertVideo(api, item, resolveMediaPath(manifestDir, video.path), manifest.language);
    } catch (error) {
      recordState(manifest, item.id, { status: error instanceof UncertainError ? "unknown" : "failed", error: error.message }, now);
      saveManifest(manifestPath, manifest);
      if (!(error instanceof UncertainError) && /quota/i.test(error.message)) {
        out.write(`quota exceeded: ${item.id} waits for the next run\n`);
        break;
      }
      throw new PublishError(`${item.id}: ${error.message}`);
    }
    used += 1;
    const url = `https://www.youtube.com/${item.type === "short" ? "shorts/" : "watch?v="}${inserted.id}`;
    recordState(manifest, item.id, { status: item.scheduled ? "scheduled" : "published", remote_id: inserted.id, url, publish_at: item.publish_at, error: null }, now);
    saveManifest(manifestPath, manifest);
    const warnings = [];
    const extras = [
      [item.thumbnail, () => setThumbnail(api, inserted.id, resolveMediaPath(manifestDir, item.thumbnail)), "thumbnail"],
      [item.options?.playlist_id, () => addToPlaylist(api, inserted.id, item.options.playlist_id), "playlist"],
      [item.options?.captions, () => insertCaptions(api, inserted.id, resolveMediaPath(manifestDir, item.options.captions), item.options?.captions_language ?? manifest.language), "captions"],
    ];
    for (const [wanted, run, name] of extras) {
      if (!wanted) continue;
      try {
        await run();
      } catch (error) {
        warnings.push(`${name}: ${error.message}`);
      }
    }
    if (warnings.length) {
      manifest.state[item.id].extra = { warnings };
      saveManifest(manifestPath, manifest);
    }
    out.write(`${item.scheduled ? "scheduled" : "published"}: ${item.id} ${when} ${url}${warnings.length ? ` (warnings: ${warnings.join("; ")})` : ""}\n`);
  }
  return manifest.state;
}

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout } = {}) {
  const valued = new Set(["--now", "--only", "--retry", "--daily-limit"]);
  const manifestPath = argv.find((arg, index) => !arg.startsWith("--") && !valued.has(argv[index - 1]));
  if (!manifestPath) throw new PublishError("usage: publish-youtube.mjs <manifest.json> [--execute] [--now ISO] [--only <id>] [--daily-limit N]");
  const execute = argv.includes("--execute");
  const api = execute ? { fetchImpl, token: await accessToken(googleCredentials("YOUTUBE_", env), fetchImpl) } : null;
  return publish(loadManifest(manifestPath), {
    manifestDir: dirname(resolve(manifestPath)),
    manifestPath,
    api,
    execute,
    now: flag(argv, "now") ? new Date(flag(argv, "now")) : new Date(),
    only: flag(argv, "only") ?? null,
    retry: String(flag(argv, "retry") ?? "").split(",").filter(Boolean),
    dailyLimit: Number(flag(argv, "daily-limit") ?? env.YOUTUBE_DAILY_UPLOAD_LIMIT ?? DEFAULT_DAILY_LIMIT),
    out,
  });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
