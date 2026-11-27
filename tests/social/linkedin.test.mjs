import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { accessToken, LinkedInClient, linkedinEnv, littleText } from "../../.rulesync/skills/linkedin-publish/scripts/linkedin.mjs";
import { dueItems, main, postContent, publish } from "../../.rulesync/skills/linkedin-publish/scripts/publish-linkedin.mjs";
import { fakeFetch, item, jpeg, json, manifest, NOW, sink, tempDir, writeManifest } from "./helpers.mjs";

const img = { path: "media/a.jpg", kind: "image", width: 1200, height: 627, alt: "Tela" };
const li = (id, date, extra = {}) => item({ id, date, publish_at: null, scheduled: false, caption: "Fechou o mês? #NFSe", hashtags: [], media: [img], ...extra });

function setup(items, overrides) {
  const dir = tempDir({ "media/a.jpg": jpeg(1200, 627), "media/v.mp4": Buffer.alloc(10, 1) });
  const data = manifest("linkedin", items, overrides);
  return { dir, data, path: writeManifest(dir, data) };
}

function api({ postFails = null, posts = [] } = {}) {
  let images = 0;
  const fetchImpl = fakeFetch([
    [(url) => url.endsWith("/rest/images?action=initializeUpload"), () => ({ value: { uploadUrl: `https://upload.example/img${++images}`, image: `urn:li:image:I${images}` } })],
    [(url) => url.startsWith("https://upload.example/img"), () => new Response("", { status: 201 })],
    [(url) => url.endsWith("/rest/videos?action=initializeUpload"), () => ({ value: { video: "urn:li:video:V1", uploadToken: "tok", uploadInstructions: [{ uploadUrl: "https://upload.example/v1", firstByte: 0, lastByte: 5 }, { uploadUrl: "https://upload.example/v2", firstByte: 6, lastByte: 9 }] } })],
    [(url) => url.startsWith("https://upload.example/v"), (url) => new Response("", { status: 200, headers: { etag: `etag-${url.slice(-2)}` } })],
    [(url) => url.endsWith("/rest/videos?action=finalizeUpload"), () => new Response("", { status: 200 })],
    [(url) => /\/rest\/(images|videos)\/urn/.test(url), () => ({ status: "AVAILABLE" })],
    [(url, call) => url.includes("/rest/posts?author="), () => ({ elements: posts })],
    [(url, call) => url.endsWith("/rest/posts") && call.method === "POST", () => (postFails === "network" ? Promise.reject(new Error("ECONNRESET")) : postFails ? json({ message: postFails }, 422) : new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:7001" } }))],
  ]);
  return fetchImpl;
}

const client = (fetchImpl) => new LinkedInClient({ token: "li-token", version: "202610", fetchImpl, organizationId: "42" });
const run = (s, fetchImpl, extra = {}) => publish(s.data, { manifestDir: s.dir, manifestPath: s.path, client: client(fetchImpl), execute: true, now: NOW, pollMs: 1, timeoutMs: 1000, out: sink(), ...extra });

test("littleText keeps the escape of a reserved character right after a hashtag", () => {
  assert.equal(littleText("Veja #Tag)"), "Veja {hashtag|\\#|Tag}\\)");
  assert.equal(littleText("#Tag* x"), "{hashtag|\\#|Tag}\\* x");
  assert.equal(littleText("#a#b"), "{hashtag|\\#|a}\\#b");
});

test("littleText escapes reserved characters and turns #tags into hashtag templates", () => {
  assert.equal(littleText("Veja (agora) https://x.com/?utm_source=linkedin #NFSe_Nacional e @fulano"), "Veja \\(agora\\) https://x.com/?utm\\_source=linkedin {hashtag|\\#|NFSe_Nacional} e \\@fulano");
});

test("a photo post uploads the image, waits for it, and posts as the organization", async () => {
  const s = setup([li("a", "2026-11-27")]);
  const fetchImpl = api();
  assert.deepEqual(await run(s, fetchImpl), ["a"]);
  const post = fetchImpl.calls.find((call) => call.url.endsWith("/rest/posts") && call.method === "POST");
  const body = JSON.parse(post.body);
  assert.equal(body.author, "urn:li:organization:42");
  assert.equal(body.visibility, "PUBLIC");
  assert.equal(body.lifecycleState, "PUBLISHED");
  assert.deepEqual(body.content, { media: { id: "urn:li:image:I1", altText: "Tela" } });
  assert.equal(body.commentary, "Fechou o mês? {hashtag|\\#|NFSe}");
  assert.equal(post.headers["linkedin-version"], "202610");
  assert.equal(post.headers["x-restli-protocol-version"], "2.0.0");
  assert.equal(fetchImpl.calls.find((call) => call.url.startsWith("https://upload.example")).headers.authorization, "Bearer li-token");
  const state = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  assert.equal(state.status, "published");
  assert.equal(state.url, "https://www.linkedin.com/feed/update/urn:li:share:7001/");
  assert.ok(state.extra.api_calls >= 4);
});

test("videos upload in parts with ETags and finalize; carousels use multiImage; link posts use an article", async () => {
  const video = li("v", "2026-11-27", { type: "video", title: "Lote", media: [{ path: "media/v.mp4", kind: "video", width: 1080, height: 1920, duration: 20 }] });
  const fetchImpl = api();
  await run(setup([video]), fetchImpl);
  const finalize = fetchImpl.calls.find((call) => call.url.endsWith("finalizeUpload"));
  assert.deepEqual(JSON.parse(finalize.body).finalizeUploadRequest, { video: "urn:li:video:V1", uploadToken: "tok", uploadedPartIds: ["etag-v1", "etag-v2"] });
  const parts = fetchImpl.calls.filter((call) => call.url.startsWith("https://upload.example/v"));
  assert.deepEqual(parts.map((call) => call.body.length), [6, 4]);
  assert.deepEqual(postContent(li("c", "2026-11-27", { type: "carousel", media: [img, img] }), ["u1", "u2"]).content.multiImage.images.map((image) => image.id), ["u1", "u2"]);
  assert.deepEqual(postContent(li("p", "2026-11-27", { type: "post", media: [], link: "https://example.com/x" }), []).content, { article: { source: "https://example.com/x", title: "example.com" } });
});

test("AI narration adds a plain-text disclosure to the post", async () => {
  const s = setup([li("a", "2026-11-27", { ai_audio: true })]);
  const fetchImpl = api();
  await run(s, fetchImpl);
  const body = JSON.parse(fetchImpl.calls.find((call) => call.url.endsWith("/rest/posts") && call.method === "POST").body);
  assert.match(body.commentary, /Narração com voz sintética \\\(Piper TTS\\\)\./);
});

test("one item per run, in date order; future items wait", async () => {
  const s = setup([li("a", "2026-11-26"), li("b", "2026-11-27"), li("c", "2026-12-01")]);
  assert.deepEqual(dueItems(s.data, NOW).map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(await run(s, api()), ["a"]);
  assert.deepEqual(await run({ ...s, data: JSON.parse(readFileSync(s.path, "utf8")) }, api()), ["b"]);
  const out = sink();
  assert.deepEqual(await run({ ...s, data: JSON.parse(readFileSync(s.path, "utf8")) }, api(), { out }), []);
  assert.match(out.text(), /nothing due/);
});

test("a lost post response is resolved by reading back the Page's posts, never posted twice", async () => {
  const s = setup([li("a", "2026-11-27")]);
  await assert.rejects(run(s, api({ postFails: "network" })), /network error/);
  const saved = JSON.parse(readFileSync(s.path, "utf8"));
  assert.equal(saved.state.a.status, "unknown");
  assert.deepEqual(saved.state.a.extra.media_urns, ["urn:li:image:I1"]);
  const found = api({ posts: [{ id: "urn:li:share:8", commentary: "Fechou o mês? {hashtag|\\#|NFSe}", content: { media: { id: "urn:li:image:OLDER" } } }, { id: "urn:li:share:9", commentary: "Fechou o mês? {hashtag|\\#|NFSe}", content: { media: { id: "urn:li:image:I1" } } }] });
  assert.deepEqual(await run({ ...s, data: saved }, found), ["a"]);
  assert.ok(!found.calls.some((call) => call.method === "PUT" || (call.url.endsWith("/rest/posts") && call.method === "POST")));
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.remote_id, "urn:li:share:9");
});

test("an unknown item not found by read-back is posted with the media already uploaded", async () => {
  const s = setup([li("a", "2026-11-27")]);
  s.data.state.a = { status: "unknown", at: NOW.toISOString(), extra: { media_urns: ["urn:li:image:OLD"] } };
  const fetchImpl = api({ posts: [] });
  await run(s, fetchImpl);
  assert.ok(!fetchImpl.calls.some((call) => call.url.includes("initializeUpload")));
  const body = JSON.parse(fetchImpl.calls.find((call) => call.url.endsWith("/rest/posts") && call.method === "POST").body);
  assert.equal(body.content.media.id, "urn:li:image:OLD");
});

test("a 4xx answer to the post is a definite failure; errors before the post are failures too", async () => {
  const s = setup([li("a", "2026-11-27")]);
  await assert.rejects(run(s, api({ postFails: "Invalid commentary" })), /422/);
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.status, "failed");
  const s2 = setup([li("b", "2026-11-27")]);
  const broken = fakeFetch([[() => true, () => json({ message: "bad owner" }, 403)]]);
  await assert.rejects(run(s2, broken), /403/);
  assert.equal(JSON.parse(readFileSync(s2.path, "utf8")).state.b.status, "failed");
});

test("the call budget and the 24-hour call limit hold items for the next run", async () => {
  const s = setup([li("a", "2026-11-27")]);
  const out = sink();
  assert.deepEqual(await run(s, api(), { callBudget: 3, out }), []);
  assert.match(out.text(), /call budget reached/);
  const s2 = setup([li("a", "2026-11-26"), li("b", "2026-11-27")]);
  s2.data.state.a = { status: "published", at: NOW.toISOString(), extra: { api_calls: 499 } };
  const out2 = sink();
  assert.deepEqual(await run(s2, api(), { out: out2 }), []);
  assert.match(out2.text(), /24 h 499\/500/);
});

test("validation: no scheduling, public only, 3000 characters, and carousel sizes", async () => {
  const s = setup([li("a", "2026-11-27", { scheduled: true, publish_at: "2026-11-27T12:00:00-03:00" }), li("b", "2026-11-27", { visibility: "private" }), li("c", "2026-11-27", { caption: "x".repeat(3001) }), li("d", "2026-11-27", { type: "carousel" })]);
  await assert.rejects(publish(s.data, { manifestDir: s.dir, manifestPath: s.path, execute: false, now: NOW, out: sink() }), (error) => /no scheduling API/.test(error.message) && /public/.test(error.message) && /3000/.test(error.message) && /2 to 20 images/.test(error.message));
});

test("credentials: env names, token refresh, rotation warning without values", async () => {
  assert.throws(() => linkedinEnv({}), /LINKEDIN_ORGANIZATION_ID, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN/);
  const token = fakeFetch([[(url) => url === "https://www.linkedin.com/oauth/v2/accessToken", (_, call) => ({ access_token: "at", expires_in: 5184000, refresh_token: call.body.get("refresh_token") === "old" ? "new-refresh-secret" : "same" })]]);
  const auth = await accessToken({ clientId: "c", clientSecret: "s", refreshToken: "old" }, token);
  assert.deepEqual(auth, { token: "at", rotated: true, refreshExpiresIn: null });
  const s = setup([li("a", "2026-11-27")]);
  const out = sink();
  const all = async (url, init) => (String(url).includes("oauth/v2") ? token(url, init) : api()(url, init));
  await main([s.path, "--execute", "--now", NOW.toISOString(), "--poll-seconds", "0"], { env: { LINKEDIN_ORGANIZATION_ID: "42", LINKEDIN_CLIENT_ID: "c", LINKEDIN_CLIENT_SECRET: "s", LINKEDIN_REFRESH_TOKEN: "old" }, fetchImpl: all, out });
  assert.match(out.text(), /new refresh token; update LINKEDIN_REFRESH_TOKEN \(value not printed\)/);
  assert.ok(!out.text().includes("new-refresh-secret"));
});

test("the call budget is enforced on every request, media polling included", async () => {
  const s = setup([li("a", "2026-11-27")]);
  let polls = 0;
  const base = api();
  const slow = async (url, init) => (/\/rest\/images\/urn/.test(String(url)) ? (polls += 1, json({ status: "PROCESSING" })) : base(url, init));
  const out = sink();
  assert.deepEqual(await publish(s.data, { manifestDir: s.dir, manifestPath: s.path, client: client(slow), execute: true, now: NOW, pollMs: 0, timeoutMs: 60000, callBudget: 12, out }), []);
  assert.match(out.text(), /call budget reached during a: it waits for the next run/);
  assert.ok(polls < 12);
  const state = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  assert.equal(state.status, "failed");
  assert.equal(state.extra.api_calls, 12);
  assert.equal(state.extra.failed_attempts, undefined, "a budget stop is not a failed attempt");
  assert.deepEqual(state.extra.media_urns, ["urn:li:image:I1"], "the uploaded image is kept for the next run");
  const next = api();
  await run({ ...s, data: JSON.parse(readFileSync(s.path, "utf8")) }, next);
  assert.ok(!next.calls.some((call) => call.url.includes("initializeUpload")), "the next run reuses the uploaded media");
});

test("a budget stop on an unknown item keeps it unknown, so the read-back still decides", async () => {
  const s = setup([li("a", "2026-11-27")], { state: { a: { status: "unknown", at: NOW.toISOString(), extra: { media_urns: ["urn:li:image:I1"], sent_at: NOW.toISOString() } } } });
  const base = api({ posts: [] });
  const slow = async (url, init) => (/\/rest\/images\/urn/.test(String(url)) ? json({ status: "PROCESSING" }) : base(url, init));
  const out = sink();
  await publish(s.data, { manifestDir: s.dir, manifestPath: s.path, client: client(slow), execute: true, now: NOW, pollMs: 0, timeoutMs: 60000, callBudget: 6, out });
  assert.match(out.text(), /call budget reached during a/);
  const state = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  assert.equal(state.status, "unknown");
  assert.equal(state.extra.sent_at, NOW.toISOString());
  assert.ok(!base.calls.some((call) => call.url.endsWith("/rest/posts") && call.method === "POST"));
});

test("the read-back window starts at the first post, not at the latest unknown run", async () => {
  const s = setup([li("a", "2026-11-27")]);
  const first = api({ postFails: "network" });
  await assert.rejects(run(s, first), /network error/);
  const afterFirst = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  const sentAt = afterFirst.extra.sent_at;
  assert.ok(sentAt);
  const later = new Date(NOW.getTime() + 24 * 3600 * 1000);
  const outage = fakeFetch([[() => true, () => { throw new Error("ECONNRESET"); }]]);
  await assert.rejects(publish(afterFirst ? JSON.parse(readFileSync(s.path, "utf8")) : null, { manifestDir: s.dir, manifestPath: s.path, client: client(outage), execute: true, now: later, pollMs: 1, timeoutMs: 1000, out: sink() }), /network error/);
  const afterSecond = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  assert.equal(afterSecond.status, "unknown");
  assert.equal(afterSecond.extra.sent_at, sentAt, "sent_at never moves");
  const third = api({ posts: [{ id: "urn:li:share:77", commentary: "Fechou o mês? {hashtag|\\#|NFSe}", createdAt: Date.parse(sentAt) + 1000, content: { media: { id: "urn:li:image:I1" } } }] });
  await publish(JSON.parse(readFileSync(s.path, "utf8")), { manifestDir: s.dir, manifestPath: s.path, client: client(third), execute: true, now: new Date(later.getTime() + 24 * 3600 * 1000), pollMs: 1, timeoutMs: 1000, out: sink() });
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.remote_id, "urn:li:share:77");
  assert.ok(!third.calls.some((call) => call.url.endsWith("/rest/posts") && call.method === "POST"));
});

test("one run with a refused post counts as one failed attempt", async () => {
  const s = setup([li("a", "2026-11-27")]);
  await assert.rejects(run(s, api({ postFails: "Invalid" })), /422/);
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.extra.failed_attempts, 1);
});

test("a failed item stops being retried by cron after 3 attempts, so later items go out", async () => {
  const s = setup([li("a", "2026-11-26"), li("b", "2026-11-27")]);
  s.data.state.a = { status: "failed", at: NOW.toISOString(), attempts: 6, error: "422 bad media", extra: { failed_attempts: 3 } };
  const out = sink();
  assert.deepEqual(await run(s, api(), { out }), ["b"]);
  assert.match(out.text(), /gave up after 3 failed attempts: a \(422 bad media\); fix it and run with --item a/);
  assert.deepEqual(dueItems(s.data, NOW, { item: "a" }).map((entry) => entry.id), ["a"]);
});

test("retries add their API calls to the 24-hour total instead of replacing them", async () => {
  const { accumulatedCalls } = await import("../../.rulesync/skills/linkedin-publish/scripts/publish-linkedin.mjs");
  assert.equal(accumulatedCalls({ at: NOW.toISOString(), extra: { api_calls: 7 } }, NOW, 5), 12);
  assert.equal(accumulatedCalls({ at: "2026-11-25T00:00:00Z", extra: { api_calls: 7 } }, NOW, 5), 5);
});

test("read-back ignores an older post with the same text", async () => {
  const { matchesAttempt } = await import("../../.rulesync/skills/linkedin-publish/scripts/publish-linkedin.mjs");
  const previous = { at: NOW.toISOString(), extra: { media_urns: ["urn:li:image:I1"] } };
  assert.equal(matchesAttempt({ commentary: "x", createdAt: NOW.getTime() - 2 * 3600 * 1000, content: { media: { id: "urn:li:image:I1" } } }, { commentary: "x", previous }), false);
  assert.equal(matchesAttempt({ commentary: "x", createdAt: NOW.getTime() + 1000, content: { media: { id: "urn:li:image:OTHER" } } }, { commentary: "x", previous }), false);
  assert.equal(matchesAttempt({ commentary: "x", createdAt: NOW.getTime() + 1000, content: { multiImage: { images: [{ id: "urn:li:image:I1" }] } } }, { commentary: "x", previous }), true);
});

test("a video part without an ETag fails clearly", async () => {
  const video = li("v", "2026-11-27", { type: "video", media: [{ path: "media/v.mp4", kind: "video", width: 1080, height: 1920, duration: 20 }] });
  const base = api();
  const noEtag = async (url, init) => (String(url).startsWith("https://upload.example/v") ? new Response("", { status: 200 }) : base(url, init));
  await assert.rejects(run(setup([video]), noEtag), /upload returned no ETag/);
});

test("after a refused post the retry uploads the media again; after a budget stop it reuses it", async () => {
  const s = setup([li("a", "2026-11-27")]);
  await assert.rejects(run(s, api({ postFails: "Invalid image" })), /422/);
  const failed = JSON.parse(readFileSync(s.path, "utf8")).state.a;
  assert.equal(failed.extra.media_urns, undefined, "media that may be the problem is dropped");
  const retry = api();
  await run({ ...s, data: failed ? JSON.parse(readFileSync(s.path, "utf8")) : null }, retry);
  assert.ok(retry.calls.some((call) => call.url.includes("/rest/images?action=initializeUpload")), "the retry uploads the current file again");
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.extra.budget_stop, undefined);
});
