#!/usr/bin/env node
// Deterministic Facebook Page publisher for an approved social manifest (no LLM decisions).
// Schedules posts, photos, multi-photo posts and Reels through the Graph API, records each result in the
// manifest's state (idempotent: a re-run skips what is already scheduled or published), and never prints tokens.
// Usage: publish-facebook.mjs <manifest.json> [--execute] [--now ISO] [--only <id>] [--retry <id,id>]
// A final call without a response leaves the item "unknown" (it may be live): it is skipped until --retry names it.
// Without --execute it validates and prints what it would do. Env: FACEBOOK_PAGE_ID,
// FACEBOOK_PAGE_ACCESS_TOKEN (a user token is exchanged for the Page token), FACEBOOK_GRAPH_VERSION.
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { GraphClient, GraphError, graphEnv } from "./graph.mjs";
import { LIMITS, splitStale, composeText, isAiGenerated, finalCall, isDone, isMain, loadManifest, pendingItems, recordState, reportBlocked, resolveMediaPath, saveManifest, UncertainError, validateManifest } from "./social-manifest.mjs";

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const RUPLOAD = "https://rupload.facebook.com/video-upload";

export class PublishError extends Error {}

const unix = (iso) => String(Math.floor(Date.parse(iso) / 1000));

/** Graph calls for one item, as data, so tests and dry runs can inspect them. */
export function plan(item, { pageId, manifestDir }) {
  const message = composeText(item, "facebook");
  const schedule = item.scheduled
    ? { published: "false", scheduled_publish_time: unix(item.publish_at), unpublished_content_type: "SCHEDULED" }
    : { published: "true" };
  const media = item.media.map((entry) => ({ ...entry, full: resolveMediaPath(manifestDir, entry.path) }));
  if (item.type === "reel") {
    return { kind: "reel", path: `${pageId}/video_reels`, video: media[0].full, description: message, title: item.title ?? undefined, scheduled: item.scheduled, publishTime: item.scheduled ? unix(item.publish_at) : undefined, aiGenerated: isAiGenerated(item) };
  }
  const feed = { message, ...schedule };
  if (item.type === "post" && item.link) feed.link = item.link;
  const photos = media.map((entry) => ({
    path: `${pageId}/photos`,
    fields: { published: "false", ...(item.scheduled ? { temporary: "true" } : {}) },
    file: { field: "source", filePath: entry.full, contentType: IMAGE_TYPES[extname(entry.full).toLowerCase()] },
  }));
  return { kind: "feed", path: `${pageId}/feed`, fields: feed, photos };
}

async function publishReel(client, step) {
  const start = await client.post(step.path, { upload_phase: "start" });
  const size = statSync(step.video).size;
  await client.request("POST", `${RUPLOAD}/${client.version}/${start.video_id}`, {
    body: readFileSync(step.video),
    headers: { authorization: `OAuth ${client.token}`, offset: "0", file_size: String(size), "content-type": "application/octet-stream" },
  });
  const finish = await finalCall(() => client.post(step.path, {
    upload_phase: "finish",
    video_id: start.video_id,
    video_state: step.scheduled ? "SCHEDULED" : "PUBLISHED",
    scheduled_publish_time: step.publishTime,
    description: step.description,
    title: step.title,
    is_ai_generated: step.aiGenerated ? "true" : undefined,
  }));
  if (finish.success === false) throw new GraphError(`Reel ${start.video_id} was not accepted`);
  return { remote_id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, extra: await copyrightCheck(client, start.video_id) };
}

/** Reads the Reel's copyright check; matches or a failed read become warnings, never a failed publish. */
export async function copyrightCheck(client, videoId) {
  try {
    const info = (await client.get(videoId, { fields: "copyright_check_information" })).copyright_check_information;
    const status = info?.status?.status ?? info?.status ?? null;
    const matches = info?.status?.matches_found ?? info?.matches_found ?? false;
    return { copyright_check: status, ...(matches ? { warnings: [`copyright check found matches (${status}); review the Reel in Meta Business Suite`] } : {}) };
  } catch (error) {
    return { warnings: [`copyright check not read: ${error.message}`] };
  }
}

async function publishFeed(client, step) {
  const fields = { ...step.fields };
  for (const [index, photo] of step.photos.entries()) {
    const uploaded = await client.postFile(photo.path, photo.fields, photo.file);
    fields[`attached_media[${index}]`] = JSON.stringify({ media_fbid: uploaded.id });
  }
  const response = await finalCall(() => client.post(step.path, fields));
  const id = response.post_id ?? response.id;
  return { remote_id: id, url: id ? `https://www.facebook.com/${id}` : null };
}

export async function publish(manifest, { manifestDir, manifestPath, client, pageId, execute, now = new Date(), only = null, retry = [], out = process.stdout }) {
  const { ready: pending, stale } = splitStale(pendingItems(manifest, { only, retry }), { now, minLeadSeconds: LIMITS.facebook.minLeadSeconds, execute });
  const errors = validateManifest(manifest, { manifestDir, forPublish: execute, now }).filter((error) => !manifest.items.some((entry) => error.startsWith(`${entry.id}:`) && !pending.includes(entry)));
  if (manifest.platform !== "facebook") errors.unshift(`manifest platform is ${manifest.platform}, not facebook`);
  if (errors.length) throw new PublishError(`invalid batch:\n- ${errors.join("\n- ")}`);
  for (const item of stale) out.write(`stale: ${item.id} publish_at ${item.publish_at} is past or too close to schedule; move it to a new batch\n`);

  for (const item of manifest.items) if (isDone(manifest, item.id)) out.write(`already ${manifest.state[item.id].status}: ${item.id} (${manifest.state[item.id].remote_id})\n`);
  reportBlocked(manifest, out, retry);
  for (const item of pending) {
    const step = plan(item, { pageId, manifestDir });
    const when = item.scheduled ? `at ${item.publish_at}` : "now";
    if (!execute) {
      out.write(`dry run: ${item.id} ${item.type} ${when}${step.photos?.length ? ` with ${step.photos.length} image(s)` : ""}\n`);
      continue;
    }
    try {
      const result = step.kind === "reel" ? await publishReel(client, step) : await publishFeed(client, step);
      recordState(manifest, item.id, { status: item.scheduled ? "scheduled" : "published", publish_at: item.publish_at, error: null, ...result }, now);
      saveManifest(manifestPath, manifest);
      out.write(`${item.scheduled ? "scheduled" : "published"}: ${item.id} ${when} (${result.remote_id})${result.extra?.warnings ? ` (warnings: ${result.extra.warnings.join("; ")})` : ""}\n`);
    } catch (error) {
      recordState(manifest, item.id, { status: error instanceof UncertainError ? "unknown" : "failed", error: error.message }, now);
      saveManifest(manifestPath, manifest);
      throw new PublishError(`${item.id}: ${error.message}`);
    }
  }
  return manifest.state;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout } = {}) {
  const execute = argv.includes("--execute");
  const nowIndex = argv.indexOf("--now");
  const onlyIndex = argv.indexOf("--only");
  const retryIndex = argv.indexOf("--retry");
  const manifestPath = argv.find((arg, index) => !arg.startsWith("--") && !["--now", "--only", "--retry"].includes(argv[index - 1]));
  if (!manifestPath) throw new PublishError("usage: publish-facebook.mjs <manifest.json> [--execute] [--now ISO] [--only <id>]");
  const { pageId, token, version } = graphEnv(env);
  if (execute && (!pageId || !token)) throw new PublishError("set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN");
  const client = execute ? await new GraphClient({ token, version, fetchImpl }).usePageToken(pageId) : null;
  const manifest = loadManifest(manifestPath);
  return publish(manifest, {
    manifestDir: dirname(resolve(manifestPath)),
    manifestPath,
    client,
    pageId: pageId || "PAGE_ID",
    execute,
    now: nowIndex >= 0 ? new Date(argv[nowIndex + 1]) : new Date(),
    only: onlyIndex >= 0 ? argv[onlyIndex + 1] : null,
    retry: retryIndex >= 0 ? String(argv[retryIndex + 1] ?? "").split(",").filter(Boolean) : [],
    out,
  });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
