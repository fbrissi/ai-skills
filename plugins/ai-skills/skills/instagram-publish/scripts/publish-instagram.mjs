#!/usr/bin/env node
// Deterministic Instagram publisher (Instagram API with Facebook Login) for an approved social manifest.
// Instagram has no scheduling API: each run publishes the next approved, not yet published item whose date has
// come (plus the stories listed in its with_stories), after uploading its media to a public S3-compatible bucket.
// Results go to the manifest's state, so re-runs never publish twice. Never prints tokens or keys.
// Usage: publish-instagram.mjs <manifest.json> [--execute] [--max N] [--item <id>] [--prefix <template>]
//        [--now ISO] [--poll-seconds N] [--timeout-seconds N]
// Env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_GRAPH_VERSION, INSTAGRAM_USER_ID (optional, derived
// from the Page), R2_ACCOUNT_ID or R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL.
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { GraphClient, GraphError, graphEnv } from "./graph.mjs";
import { putObject, s3Config } from "./s3.mjs";
import { composeText, finalCall, isDone, isMain, loadManifest, recordState, resolveMediaPath, saveManifest, UncertainError, validateManifest, zoneOffset } from "./social-manifest.mjs";

export const DEFAULT_PREFIX = "marketing/instagram/{date}/{id}/";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export class PublishError extends Error {}

function today(timeZone, now) {
  const offset = zoneOffset(timeZone, now);
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return new Date(now.getTime() + sign * (hours * 60 + minutes) * 60000).toISOString().slice(0, 10);
}

/**
 * Items due now, in manifest order. A story attached to a feed item travels with it while the parent is pending;
 * once the parent is done, a story that is still not done (it failed) is due on its own.
 */
export function dueItems(manifest, now = new Date(), { item = null } = {}) {
  const parents = new Map(manifest.items.flatMap((entry) => (entry.with_stories ?? []).map((story) => [story, entry.id])));
  const day = today(manifest.timezone, now);
  return manifest.items.filter((entry) => {
    if (isDone(manifest, entry.id)) return false;
    if (item) return entry.id === item;
    if (parents.has(entry.id)) return isDone(manifest, parents.get(entry.id));
    if (entry.publish_at) return Date.parse(entry.publish_at) <= now.getTime();
    return entry.date <= day;
  });
}

export function mediaKey(prefix, item, path) {
  const folder = prefix.replaceAll("{date}", item.date).replaceAll("{id}", item.id).replace(/^\/+/, "");
  return `${folder.endsWith("/") ? folder : `${folder}/`}${basename(path)}`;
}

export function containerFields(item, urls, caption) {
  const [first] = item.media;
  if (item.type === "photo") return [{ image_url: urls[0], caption }];
  if (item.type === "story") return [first.kind === "video" ? { media_type: "STORIES", video_url: urls[0] } : { media_type: "STORIES", image_url: urls[0] }];
  if (item.type === "reel") return [{ media_type: "REELS", video_url: urls[0], caption, share_to_feed: String(item.options?.share_to_feed ?? true) }];
  if (item.type === "carousel") {
    return item.media.map((media, index) => (media.kind === "video" ? { media_type: "VIDEO", video_url: urls[index], is_carousel_item: "true" } : { image_url: urls[index], is_carousel_item: "true" }));
  }
  throw new PublishError(`${item.id}: unsupported type ${item.type}`);
}

async function waitReady(client, containerId, { pollMs, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await client.get(containerId, { fields: "status_code,status" });
    if (status.status_code === "FINISHED" || status.status_code === undefined) return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new GraphError(`container ${containerId} ${status.status_code}: ${status.status ?? ""}`);
    if (Date.now() > deadline) throw new GraphError(`container ${containerId} not ready after ${Math.round(timeoutMs / 1000)} s (${status.status_code})`);
    await sleep(pollMs);
  }
}

export async function publishingQuota(client, igUserId) {
  const data = await client.get(`${igUserId}/content_publishing_limit`, { fields: "config,quota_usage" });
  const entry = data.data?.[0] ?? {};
  const total = entry.config?.quota_total ?? 100;
  return { used: entry.quota_usage ?? 0, total, left: total - (entry.quota_usage ?? 0) };
}

async function publishContainer(client, igUserId, creationId) {
  const published = await finalCall(() => client.post(`${igUserId}/media_publish`, { creation_id: creationId }));
  let permalink = null;
  try {
    permalink = (await client.get(published.id, { fields: "permalink" })).permalink ?? null;
  } catch {
    permalink = null;
  }
  return { remote_id: published.id, url: permalink };
}

/**
 * Resolves an item left "unknown" (media_publish sent, no response) from its saved container: PUBLISHED means it
 * is live; FINISHED means it never went out, so the same container is published now. Anything else redoes the item.
 */
async function resumeContainer(state, { client, igUserId }) {
  const creationId = state?.extra?.creation_id;
  if (!creationId) return null;
  const status = (await client.get(creationId, { fields: "status_code" })).status_code;
  if (status === "PUBLISHED") return { remote_id: null, url: null, media_urls: state.media_urls ?? [], extra: { creation_id: creationId, resolved: "container already published" } };
  if (status === "FINISHED") return { ...(await publishContainer(client, igUserId, creationId)), media_urls: state.media_urls ?? [], extra: { creation_id: creationId } };
  return null;
}

async function publishOne(item, { client, igUserId, s3, prefix, manifestDir, fetchImpl, pollMs, timeoutMs, checkpoint }) {
  const urls = [];
  for (const media of item.media) {
    const full = resolveMediaPath(manifestDir, media.path);
    const type = media.kind === "image" ? "image/jpeg" : /\.mov$/i.test(media.path) ? "video/quicktime" : "video/mp4";
    urls.push(await putObject(s3, mediaKey(prefix, item, media.path), readFileSync(full), type, fetchImpl));
  }
  const caption = composeText(item, "instagram");
  const fields = containerFields(item, urls, caption);
  let creationId;
  if (item.type === "carousel") {
    const children = [];
    for (const child of fields) {
      const created = await client.post(`${igUserId}/media`, child);
      await waitReady(client, created.id, { pollMs, timeoutMs });
      children.push(created.id);
    }
    creationId = (await client.post(`${igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
  } else {
    creationId = (await client.post(`${igUserId}/media`, fields[0])).id;
  }
  await waitReady(client, creationId, { pollMs, timeoutMs });
  checkpoint({ media_urls: urls, extra: { creation_id: creationId } });
  return { ...(await publishContainer(client, igUserId, creationId)), media_urls: urls, extra: { creation_id: creationId } };
}

export async function publish(manifest, { manifestDir, manifestPath, client, igUserId, s3, execute, now = new Date(), max = 1, item = null, prefix = DEFAULT_PREFIX, fetchImpl = fetch, pollMs = 5000, timeoutMs = 600000, out = process.stdout }) {
  const errors = validateManifest(manifest, { manifestDir, forPublish: execute, now }).filter((error) => !manifest.items.some((entry) => error.startsWith(`${entry.id}:`) && isDone(manifest, entry.id)));
  if (manifest.platform !== "instagram") errors.unshift(`manifest platform is ${manifest.platform}, not instagram`);
  if (errors.length) throw new PublishError(`invalid batch:\n- ${errors.join("\n- ")}`);

  const due = dueItems(manifest, now, { item }).slice(0, max);
  if (!due.length) {
    out.write("nothing due: every approved item is published or waits for its date\n");
    return [];
  }
  const done = [];
  for (const entry of due) {
    const stories = (entry.with_stories ?? []).map((id) => manifest.items.find((candidate) => candidate.id === id)).filter((story) => story && !isDone(manifest, story.id));
    if (!execute) {
      out.write(`dry run: ${entry.id} ${entry.type}${stories.length ? ` + ${stories.length} story(ies)` : ""} -> ${mediaKey(prefix, entry, entry.media[0].path)}\n`);
      continue;
    }
    const quota = await publishingQuota(client, igUserId);
    if (quota.left < 1 + stories.length) {
      out.write(`publishing limit reached (${quota.used}/${quota.total} in 24 h): ${entry.id} waits for the next run\n`);
      break;
    }
    for (const target of [entry, ...stories]) {
      try {
        const checkpoint = (entry) => {
          recordState(manifest, target.id, { status: "unknown", error: "media_publish sent; waiting for the response", ...entry }, now);
          saveManifest(manifestPath, manifest);
        };
        const previous = manifest.state[target.id];
        const result = (previous?.status === "unknown" ? await resumeContainer(previous, { client, igUserId }) : null) ?? (await publishOne(target, { client, igUserId, s3, prefix, manifestDir, fetchImpl, pollMs, timeoutMs, checkpoint }));
        recordState(manifest, target.id, { status: "published", publish_at: now.toISOString(), error: null, ...result }, now);
        saveManifest(manifestPath, manifest);
        out.write(`published: ${target.id} (${result.remote_id})${result.url ? ` ${result.url}` : ""}\n`);
        done.push(target.id);
      } catch (error) {
        recordState(manifest, target.id, { status: error instanceof UncertainError ? "unknown" : "failed", error: error.message }, now);
        saveManifest(manifestPath, manifest);
        throw new PublishError(`${target.id}: ${error.message}`);
      }
    }
  }
  return done;
}

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout } = {}) {
  const valued = new Set(["--max", "--item", "--prefix", "--now", "--poll-seconds", "--timeout-seconds"]);
  const manifestPath = argv.find((arg, index) => !arg.startsWith("--") && !valued.has(argv[index - 1]));
  if (!manifestPath) throw new PublishError("usage: publish-instagram.mjs <manifest.json> [--execute] [--max N] [--item <id>] [--prefix <template>] [--now ISO]");
  const execute = argv.includes("--execute");
  const manifest = loadManifest(manifestPath);
  let client = null;
  let igUserId = null;
  let s3 = null;
  if (execute) {
    const { pageId, token, version } = graphEnv(env);
    if (!pageId || !token) throw new PublishError("set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN");
    s3 = s3Config(env);
    client = await new GraphClient({ token, version, fetchImpl }).usePageToken(pageId);
    igUserId = env.INSTAGRAM_USER_ID || (await client.instagramUserId(pageId));
  }
  return publish(manifest, {
    manifestDir: dirname(resolve(manifestPath)),
    manifestPath,
    client,
    igUserId,
    s3,
    execute,
    now: flag(argv, "now") ? new Date(flag(argv, "now")) : new Date(),
    max: Number(flag(argv, "max") ?? 1),
    item: flag(argv, "item") ?? null,
    prefix: flag(argv, "prefix") ?? env.INSTAGRAM_MEDIA_PREFIX ?? DEFAULT_PREFIX,
    fetchImpl,
    pollMs: Number(flag(argv, "poll-seconds") ?? 5) * 1000,
    timeoutMs: Number(flag(argv, "timeout-seconds") ?? 600) * 1000,
    out,
  });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
