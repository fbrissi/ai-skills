#!/usr/bin/env node
// Deterministic LinkedIn Page publisher (Community Management API) for an approved social manifest. LinkedIn has
// no scheduling API: each run publishes the next due item (one by default), uploading its media through the Images
// and Videos APIs (no public URL needed), and records the result in the manifest's state. Before the final POST it
// saves the item as "unknown" with its media URNs; a later run resolves it by reading the Page's recent posts
// (r_organization_social), so a lost response never posts twice. Never prints tokens.
// Usage: publish-linkedin.mjs <manifest.json> [--execute] [--max N] [--item <id>] [--now ISO]
//        [--call-budget N] [--daily-calls N] [--poll-seconds N] [--timeout-seconds N]
// Env: LINKEDIN_ORGANIZATION_ID, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN,
//      LINKEDIN_API_VERSION (default 202610), LINKEDIN_DAILY_CALLS (default 500).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { accessToken, LinkedInClient, LinkedInError, linkedinEnv, littleText, postUrl } from "./linkedin.mjs";
import { composeText, isDone, isMain, loadManifest, recordState, resolveMediaPath, saveManifest, validateManifest, zoneOffset } from "./social-manifest.mjs";

export const DEFAULT_CALL_BUDGET = 100;
export const DEFAULT_DAILY_CALLS = 500;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export class PublishError extends Error {}

function today(timeZone, now) {
  const offset = zoneOffset(timeZone, now);
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return new Date(now.getTime() + sign * (hours * 60 + minutes) * 60000).toISOString().slice(0, 10);
}

export const MAX_ATTEMPTS = 3;

/**
 * A failed item that used up its attempts is skipped by cron runs so it cannot block the queue (--item forces it).
 * Only real failures count (extra.failed_attempts); checkpoints and budget stops do not.
 */
export const gaveUp = (manifest, id) => manifest.state?.[id]?.status === "failed" && (manifest.state[id].extra?.failed_attempts ?? 0) >= MAX_ATTEMPTS;

/** Items due now, in manifest order: not done, and dated today or earlier (or publish_at passed when set). */
export function dueItems(manifest, now = new Date(), { item = null } = {}) {
  const day = today(manifest.timezone, now);
  return manifest.items.filter((entry) => {
    if (isDone(manifest, entry.id)) return false;
    if (item) return entry.id === item;
    if (gaveUp(manifest, entry.id)) return false;
    if (entry.publish_at) return Date.parse(entry.publish_at) <= now.getTime();
    return entry.date <= day;
  });
}

/** API calls this manifest recorded in the last 24 hours, against the app's daily limit. */
export function callsInLast24h(manifest, now) {
  return Object.values(manifest.state ?? {}).filter((entry) => now.getTime() - Date.parse(entry.at) < 24 * 3600 * 1000).reduce((sum, entry) => sum + (entry.extra?.api_calls ?? 0), 0);
}

/** Calls of earlier attempts in the last 24 hours plus this run's, so retries add up instead of replacing. */
export function accumulatedCalls(previous, now, runCalls) {
  const recent = previous?.at && now.getTime() - Date.parse(previous.at) < 24 * 3600 * 1000 ? previous.extra?.api_calls ?? 0 : 0;
  return recent + runCalls;
}

/** Estimate of calls an item needs (uploads, a few status polls, post, read-back); the client enforces the real budget. */
export function estimateCalls(item) {
  const images = item.media.filter((media) => media.kind === "image").length;
  const videos = item.media.filter((media) => media.kind === "video").length;
  return 2 + images * 4 + videos * 8;
}

export function postContent(item, mediaUrns) {
  if (item.type === "post") return item.link ? { content: { article: { source: item.link, title: item.title ?? new URL(item.link).hostname } } } : {};
  if (item.type === "photo") return { content: { media: { id: mediaUrns[0], ...(item.media[0].alt ? { altText: item.media[0].alt } : {}) } } };
  if (item.type === "video") return { content: { media: { id: mediaUrns[0], ...(item.title ? { title: item.title } : {}) } } };
  if (item.type === "carousel") return { content: { multiImage: { images: mediaUrns.map((id, index) => ({ id, ...(item.media[index].alt ? { altText: item.media[index].alt } : {}) })) } } };
  throw new PublishError(`${item.id}: unsupported type ${item.type}`);
}

const contentIds = (post) => [post.content?.media?.id, ...(post.content?.multiImage?.images ?? []).map((image) => image.id)].filter(Boolean);

/**
 * A recent Page post that is this item: same commentary, created after the attempt started (10 min of clock slack),
 * and, when media was uploaded, carrying those media URNs, so an older post with the same text never matches.
 */
export function matchesAttempt(post, { commentary, previous }) {
  if (post.commentary !== commentary) return false;
  // sent_at is the first POST of the attempt; later unknown runs never move it, so a live post always stays in range.
  const sentAt = previous?.extra?.sent_at ?? previous?.at;
  const since = sentAt ? Date.parse(sentAt) - 10 * 60 * 1000 : 0;
  if (post.createdAt && post.createdAt < since) return false;
  const urns = previous?.extra?.media_urns ?? [];
  return !urns.length || contentIds(post).some((id) => urns.includes(id));
}

async function findExisting(client, commentary, previous) {
  const posts = await client.recentPosts(20);
  return posts.find((post) => matchesAttempt(post, { commentary, previous })) ?? null;
}

async function publishOne(item, { client, manifestDir, language, previous, checkpoint, pollMs, timeoutMs, attempt }) {
  const commentary = littleText(composeText(item, "linkedin", language));
  if (previous?.status === "unknown") {
    const existing = await findExisting(client, commentary, previous);
    if (existing) return { remote_id: existing.id, url: postUrl(existing.id), extra: { resolved: "found by read-back" } };
  }
  // Media uploaded by an earlier attempt (cut by the budget or a failure after the upload) is reused.
  let urns = previous?.extra?.media_urns ?? [];
  if (urns.length !== item.media.length) {
    urns = [];
    for (const media of item.media) {
      const bytes = readFileSync(resolveMediaPath(manifestDir, media.path));
      urns.push(media.kind === "video" ? await client.uploadVideo(bytes) : await client.uploadImage(bytes));
    }
  }
  attempt.mediaUrns = urns;
  for (const urn of urns) await client.waitAvailable(urn, { pollMs, timeoutMs, sleep });
  if (client.maxCalls !== undefined && client.calls >= client.maxCalls) {
    const error = new LinkedInError(`call budget exhausted after ${client.calls} calls; the item waits for the next run`);
    error.budget = true;
    throw error;
  }
  checkpoint({ extra: { media_urns: urns, sent_at: previous?.status === "unknown" ? previous.extra?.sent_at ?? previous.at : new Date().toISOString() } });
  attempt.posted = true;
  let id;
  try {
    id = await client.createPost({ commentary, ...postContent(item, urns) });
  } catch (error) {
    // A 4xx answer is a definite refusal (nothing was posted); network errors and 5xx stay uncertain.
    if (error.status >= 400 && error.status < 500) error.definite = true;
    throw error;
  }
  return { remote_id: id, url: postUrl(id), extra: { media_urns: urns } };
}

/**
 * Status after an error. A post this run sent without a clear answer (network, 5xx) is unknown; a 4xx on this run's
 * own post is failed. Errors before this run's post (budget stops included) leave an unknown item unknown, so the
 * read-back still decides, and otherwise mark it failed (a budget stop does not count as a failed attempt).
 */
export function outcomeStatus({ previous, error, attempt }) {
  if (attempt.posted && !error.budget) return error.definite ? "failed" : "unknown";
  return previous?.status === "unknown" ? "unknown" : "failed";
}

export async function publish(manifest, { manifestDir, manifestPath, client, execute, now = new Date(), max = 1, item = null, callBudget = DEFAULT_CALL_BUDGET, dailyCalls = DEFAULT_DAILY_CALLS, pollMs = 5000, timeoutMs = 900000, out = process.stdout }) {
  const errors = validateManifest(manifest, { manifestDir, forPublish: execute, now }).filter((error) => !manifest.items.some((entry) => error.startsWith(`${entry.id}:`) && isDone(manifest, entry.id)));
  if (manifest.platform !== "linkedin") errors.unshift(`manifest platform is ${manifest.platform}, not linkedin`);
  if (errors.length) throw new PublishError(`invalid batch:\n- ${errors.join("\n- ")}`);
  for (const entry of manifest.items) if (!item && gaveUp(manifest, entry.id)) out.write(`gave up after ${MAX_ATTEMPTS} failed attempts: ${entry.id} (${manifest.state[entry.id].error}); fix it and run with --item ${entry.id}\n`);
  const due = dueItems(manifest, now, { item }).slice(0, max);
  if (!due.length) {
    out.write("nothing due: every approved item is published or waits for its date\n");
    return [];
  }
  const done = [];
  // Calls recorded before this run, read once: items finished in this run are counted through client.calls only.
  const spentToday = execute ? callsInLast24h(manifest, now) : 0;
  for (const entry of due) {
    if (!execute) {
      out.write(`dry run: ${entry.id} ${entry.type}${entry.media.length ? ` with ${entry.media.length} file(s)` : ""} (about ${estimateCalls(entry)} API calls)\n`);
      continue;
    }
    if (client.calls + estimateCalls(entry) > callBudget || spentToday + client.calls + estimateCalls(entry) > dailyCalls) {
      out.write(`call budget reached (run ${client.calls}/${callBudget}, 24 h ${spentToday + client.calls}/${dailyCalls}): ${entry.id} waits for the next run\n`);
      break;
    }
    const previous = manifest.state[entry.id];
    const before = client.calls;
    client.maxCalls = client.calls + Math.min(callBudget - client.calls, dailyCalls - spentToday - client.calls);
    const calls = () => accumulatedCalls(previous, now, client.calls - before);
    const checkpoint = (extra) => {
      recordState(manifest, entry.id, { status: "unknown", error: "post sent; waiting for the response", ...extra, extra: { ...extra.extra, api_calls: calls() } }, now);
      saveManifest(manifestPath, manifest);
    };
    const attempt = { posted: false, mediaUrns: null };
    try {
      const result = await publishOne(entry, { client, manifestDir, language: manifest.language, previous, checkpoint, pollMs, timeoutMs, attempt });
      recordState(manifest, entry.id, { status: "published", publish_at: now.toISOString(), error: null, ...result, extra: { ...result.extra, api_calls: calls() } }, now);
      saveManifest(manifestPath, manifest);
      out.write(`published: ${entry.id} (${result.remote_id}) ${result.url}\n`);
      done.push(entry.id);
    } catch (error) {
      const status = outcomeStatus({ previous, error, attempt });
      const extra = { ...(previous?.extra ?? {}), ...(manifest.state[entry.id]?.extra ?? {}), ...(attempt.mediaUrns ? { media_urns: attempt.mediaUrns } : {}), api_calls: calls() };
      if (status === "failed" && !error.budget) extra.failed_attempts = (previous?.extra?.failed_attempts ?? 0) + 1;
      recordState(manifest, entry.id, { status, error: error.message, extra }, now);
      saveManifest(manifestPath, manifest);
      if (error.budget) {
        out.write(`call budget reached during ${entry.id}: it waits for the next run\n`);
        break;
      }
      throw new PublishError(`${entry.id}: ${error.message}`);
    }
  }
  return done;
}

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, out = process.stdout } = {}) {
  const valued = new Set(["--max", "--item", "--now", "--call-budget", "--daily-calls", "--poll-seconds", "--timeout-seconds"]);
  const manifestPath = argv.find((arg, index) => !arg.startsWith("--") && !valued.has(argv[index - 1]));
  if (!manifestPath) throw new PublishError("usage: publish-linkedin.mjs <manifest.json> [--execute] [--max N] [--item <id>] [--call-budget N] [--daily-calls N] [--now ISO]");
  const execute = argv.includes("--execute");
  let client = null;
  if (execute) {
    const settings = linkedinEnv(env);
    const auth = await accessToken(settings, fetchImpl);
    if (auth.rotated) out.write("warning: LinkedIn returned a new refresh token; update LINKEDIN_REFRESH_TOKEN (value not printed)\n");
    client = new LinkedInClient({ token: auth.token, version: settings.version, fetchImpl, organizationId: settings.organizationId });
  }
  return publish(loadManifest(manifestPath), {
    manifestDir: dirname(resolve(manifestPath)),
    manifestPath,
    client,
    execute,
    now: flag(argv, "now") ? new Date(flag(argv, "now")) : new Date(),
    max: Number(flag(argv, "max") ?? 1),
    item: flag(argv, "item") ?? null,
    callBudget: Number(flag(argv, "call-budget") ?? DEFAULT_CALL_BUDGET),
    dailyCalls: Number(flag(argv, "daily-calls") ?? env.LINKEDIN_DAILY_CALLS ?? DEFAULT_DAILY_CALLS),
    pollMs: Number(flag(argv, "poll-seconds") ?? 5) * 1000,
    timeoutMs: Number(flag(argv, "timeout-seconds") ?? 900) * 1000,
    out,
  });
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

