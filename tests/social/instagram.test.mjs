import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GraphClient } from "../../.rulesync/skills/instagram-publish/scripts/graph.mjs";
import { containerFields, dueItems, mediaKey, publish } from "../../.rulesync/skills/instagram-publish/scripts/publish-instagram.mjs";
import { s3Config, signPut } from "../../.rulesync/skills/instagram-publish/scripts/s3.mjs";
import { fakeFetch, item, jpeg, manifest, NOW, sink, tempDir, writeManifest } from "./helpers.mjs";

const S3 = { endpoint: "https://acc.r2.cloudflarestorage.com", accessKeyId: "AKID", secretAccessKey: "secret-key-value", bucket: "media", publicBaseUrl: "https://cdn.example.com", region: "auto" };
const img = { path: "media/a.jpg", kind: "image", width: 1080, height: 1350 };
const ig = (id, date, extra = {}) => item({ id, date, publish_at: null, scheduled: false, media: [img], ...extra });

function setup(items, overrides) {
  const dir = tempDir({ "media/a.jpg": jpeg(1080, 1350), "media/s.jpg": jpeg(1080, 1920), "media/r.mp4": "mp4" });
  const data = manifest("instagram", items, overrides);
  return { dir, data, path: writeManifest(dir, data) };
}

function graph({ used = 0, total = 100, statuses = ["FINISHED"] } = {}) {
  let container = 0;
  let poll = 0;
  return fakeFetch([
    [(url) => url.startsWith(S3.endpoint), () => new Response("", { status: 200 })],
    [(url) => url.includes("/content_publishing_limit"), () => ({ data: [{ quota_usage: used, config: { quota_total: total } }] })],
    [(url, call) => url.endsWith("/ig1/media") && call.method === "POST", () => ({ id: `c${++container}` })],
    [(url) => url.endsWith("/ig1/media_publish"), (_, call) => ({ id: `m-${call.body.get("creation_id")}` })],
    [(url) => /\/c\d+\?fields=status_code/.test(url), () => ({ status_code: statuses[Math.min(poll++, statuses.length - 1)] })],
    [(url) => /\/m-c\d+\?fields=permalink/.test(url), (url) => ({ permalink: `https://instagram.com/p/${url.match(/m-(c\d+)/)[1]}` })],
  ]);
}

const run = (setupResult, fetchImpl, extra = {}) =>
  publish(setupResult.data, { manifestDir: setupResult.dir, manifestPath: setupResult.path, client: new GraphClient({ token: "tok-value-123", fetchImpl }), igUserId: "ig1", s3: S3, execute: true, now: NOW, fetchImpl, pollMs: 1, timeoutMs: 1000, out: sink(), ...extra });

test("only items whose date has come are due, in order; attached stories are not due alone", () => {
  const data = manifest("instagram", [ig("future", "2026-12-02"), ig("today", "2026-11-27", { with_stories: ["story"] }), ig("story", "2026-11-27", { type: "story" }), ig("past", "2026-11-25")]);
  assert.deepEqual(dueItems(data, NOW).map((entry) => entry.id), ["today", "past"]);
  data.state.today = { status: "published", at: NOW.toISOString() };
  data.state.story = { status: "failed", at: NOW.toISOString() };
  assert.deepEqual(dueItems(data, NOW).map((entry) => entry.id), ["story", "past"], "a failed story is retried once its parent is published");
});

test("a photo is uploaded to the bucket, published in two steps and recorded", async () => {
  const setupResult = setup([ig("p1", "2026-11-27")]);
  const fetchImpl = graph();
  const done = await run(setupResult, fetchImpl);
  assert.deepEqual(done, ["p1"]);
  const put = fetchImpl.calls.find((call) => call.method === "PUT");
  assert.equal(put.url, "https://acc.r2.cloudflarestorage.com/media/marketing/instagram/2026-11-27/p1/a.jpg");
  assert.match(put.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  const create = fetchImpl.calls.find((call) => call.url.endsWith("/ig1/media"));
  assert.equal(create.body.get("image_url"), "https://cdn.example.com/marketing/instagram/2026-11-27/p1/a.jpg");
  assert.match(create.body.get("caption"), /#NFSe/);
  const saved = JSON.parse(readFileSync(setupResult.path, "utf8"));
  assert.equal(saved.state.p1.status, "published");
  assert.equal(saved.state.p1.url, "https://instagram.com/p/c1");
});

test("one item per run by default; the next run publishes the next item", async () => {
  const setupResult = setup([ig("a", "2026-11-26"), ig("b", "2026-11-27")]);
  assert.deepEqual(await run(setupResult, graph()), ["a"]);
  assert.deepEqual(await run(setupResult, graph()), ["b"]);
  const out = sink();
  assert.deepEqual(await run(setupResult, graph(), { out }), []);
  assert.match(out.text(), /nothing due/);
});

test("stories listed in with_stories go out in the same run", async () => {
  const story = ig("s", "2026-11-27", { type: "story", caption: null, hashtags: [], media: [{ path: "media/s.jpg", kind: "image", width: 1080, height: 1920 }] });
  const setupResult = setup([ig("feed", "2026-11-27", { with_stories: ["s"] }), story]);
  assert.deepEqual(await run(setupResult, graph()), ["feed", "s"]);
  assert.deepEqual(containerFields(story, ["u"], ""), [{ media_type: "STORIES", image_url: "u" }]);
});

test("the publishing limit stops the run before anything is uploaded", async () => {
  const setupResult = setup([ig("a", "2026-11-27")]);
  const fetchImpl = graph({ used: 100, total: 100 });
  const out = sink();
  assert.deepEqual(await run(setupResult, fetchImpl, { out }), []);
  assert.match(out.text(), /publishing limit reached \(100\/100/);
  assert.ok(!fetchImpl.calls.some((call) => call.method === "PUT"));
});

test("reels wait for the container to finish; carousels create children first", async () => {
  const reel = ig("r", "2026-11-27", { type: "reel", media: [{ path: "media/r.mp4", kind: "video", width: 1080, height: 1920, duration: 30 }] });
  const fetchImpl = graph({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"] });
  await run(setup([reel]), fetchImpl);
  const create = fetchImpl.calls.find((call) => call.url.endsWith("/ig1/media"));
  assert.equal(create.body.get("media_type"), "REELS");
  assert.equal(create.body.get("share_to_feed"), "true");
  assert.equal(fetchImpl.calls.filter((call) => call.url.includes("fields=status_code")).length, 3);

  const carousel = ig("c", "2026-11-27", { type: "carousel", media: [img, img] });
  const fetch2 = graph();
  await run(setup([carousel]), fetch2);
  const creates = fetch2.calls.filter((call) => call.url.endsWith("/ig1/media"));
  assert.deepEqual(creates.map((call) => call.body.get("is_carousel_item") ?? call.body.get("media_type")), ["true", "true", "CAROUSEL"]);
  assert.equal(creates[2].body.get("children"), "c1,c2");
});

test("a container error marks the item failed", async () => {
  const reel = ig("r", "2026-11-27", { type: "reel", media: [{ path: "media/r.mp4", kind: "video", width: 1080, height: 1920, duration: 30 }] });
  const setupResult = setup([reel]);
  await assert.rejects(run(setupResult, graph({ statuses: ["ERROR"] })), /container c1 ERROR/);
  assert.equal(JSON.parse(readFileSync(setupResult.path, "utf8")).state.r.status, "failed");
});

test("dry run and validation: scheduled Instagram items are rejected", async () => {
  const bad = setup([ig("x", "2026-11-27", { scheduled: true, publish_at: "2026-11-27T12:00:00-03:00" })]);
  await assert.rejects(publish(bad.data, { manifestDir: bad.dir, manifestPath: bad.path, execute: false, now: NOW, out: sink() }), /no scheduling API/);
  const good = setup([ig("x", "2026-11-27")]);
  const out = sink();
  await publish(good.data, { manifestDir: good.dir, manifestPath: good.path, execute: false, now: NOW, out });
  assert.match(out.text(), /dry run: x photo -> marketing\/instagram\/2026-11-27\/x\/a.jpg/);
});

test("media keys follow the prefix template and S3 config needs every value", () => {
  assert.equal(mediaKey("/social/{date}/{id}", { date: "2026-12-01", id: "x" }, "media/a b.jpg"), "social/2026-12-01/x/a b.jpg");
  assert.throws(() => s3Config({ R2_ACCOUNT_ID: "a" }), /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL/);
  const signed = signPut(S3, "a b.jpg", Buffer.from("x"), "image/jpeg", new Date("2026-11-27T00:00:00Z"));
  assert.equal(signed.url, "https://acc.r2.cloudflarestorage.com/media/a%20b.jpg");
  assert.ok(!JSON.stringify(signed).includes("secret-key-value"));
});

test("SigV4 matches the AWS CLI (botocore) for the same request", () => {
  // Reference: aws s3api put-object --debug with AWS_REQUEST_CHECKSUM_CALCULATION=when_required at 20261127T051009Z.
  const config = { endpoint: "http://127.0.0.1:9", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", bucket: "media", region: "auto" };
  const signed = signPut(config, "marketing/a b.jpg", Buffer.from("hello"), "image/jpeg", new Date("2026-11-27T05:10:09Z"));
  assert.match(signed.headers.authorization, /Signature=6a76382157434057b5dd0653e32c8ff003bfe97b6369a592cf2fa1e992f0bb1b$/);
});

test("a lost media_publish response is resolved from the saved container, never published twice", async () => {
  const setupResult = setup([ig("p1", "2026-11-27")]);
  const lost = graph();
  const original = lost;
  const failing = async (url, init) => {
    if (String(url).endsWith("/ig1/media_publish")) throw new Error("ETIMEDOUT");
    return original(url, init);
  };
  await assert.rejects(run(setupResult, failing), /network error/);
  const saved = JSON.parse(readFileSync(setupResult.path, "utf8"));
  assert.equal(saved.state.p1.status, "unknown");
  assert.equal(saved.state.p1.extra.creation_id, "c1");

  const live = fakeFetch([[(url) => url.includes("/c1?fields=status_code"), () => ({ status_code: "PUBLISHED" })], [(url) => url.includes("/content_publishing_limit"), () => ({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] })]]);
  assert.deepEqual(await run({ ...setupResult, data: saved }, live), ["p1"]);
  assert.ok(!live.calls.some((call) => call.method === "PUT" || call.url.endsWith("/media_publish")));
  assert.equal(JSON.parse(readFileSync(setupResult.path, "utf8")).state.p1.status, "published");
});

test("an unknown item whose container is still FINISHED is published with the same container", async () => {
  const setupResult = setup([ig("p1", "2026-11-27")]);
  setupResult.data.state.p1 = { status: "unknown", at: NOW.toISOString(), media_urls: ["u"], extra: { creation_id: "c9" } };
  const fetchImpl = fakeFetch([
    [(url) => url.includes("/content_publishing_limit"), () => ({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] })],
    [(url) => url.includes("/c9?fields=status_code"), () => ({ status_code: "FINISHED" })],
    [(url) => url.endsWith("/ig1/media_publish"), (_, call) => ({ id: `m-${call.body.get("creation_id")}` })],
    [(url) => url.includes("/m-c9?fields=permalink"), () => ({ permalink: "https://instagram.com/p/x" })],
  ]);
  await run(setupResult, fetchImpl);
  assert.ok(!fetchImpl.calls.some((call) => call.method === "PUT"));
  assert.equal(JSON.parse(readFileSync(setupResult.path, "utf8")).state.p1.remote_id, "m-c9");
});

test("an error while checking a saved container keeps the item unknown, so it is never uploaded again", async () => {
  const setupResult = setup([ig("p1", "2026-11-27")]);
  setupResult.data.state.p1 = { status: "unknown", at: NOW.toISOString(), media_urls: ["u"], extra: { creation_id: "c9" } };
  const flaky = fakeFetch([
    [(url) => url.includes("/content_publishing_limit"), () => ({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] })],
    [(url) => url.includes("/c9?fields=status_code"), () => new Response(JSON.stringify({ error: { message: "temporarily unavailable", code: 2 } }), { status: 503 })],
  ]);
  await assert.rejects(run(setupResult, flaky), /temporarily unavailable/);
  const saved = JSON.parse(readFileSync(setupResult.path, "utf8"));
  assert.equal(saved.state.p1.status, "unknown");
  assert.equal(saved.state.p1.extra.creation_id, "c9");
  assert.ok(!flaky.calls.some((call) => call.method === "PUT"));
});

test("an HTTP error from media_publish after the container is saved keeps it unknown", async () => {
  const setupResult = setup([ig("p1", "2026-11-27")]);
  const base = graph();
  const failing = async (url, init) => (String(url).endsWith("/ig1/media_publish") ? new Response(JSON.stringify({ error: { message: "server error", code: 1 } }), { status: 500 }) : base(url, init));
  await assert.rejects(run(setupResult, failing), /server error/);
  assert.equal(JSON.parse(readFileSync(setupResult.path, "utf8")).state.p1.status, "unknown");
});

test("Instagram containers carry alt text and the AI label (carousel: parent only)", async () => {
  const alt = { path: "media/a.jpg", kind: "image", width: 1080, height: 1350, alt: "Tela de recorrências" };
  assert.deepEqual(containerFields(ig("p", "2026-11-27", { ai_audio: true, media: [alt] }), ["u"], "c"), [{ image_url: "u", caption: "c", alt_text: "Tela de recorrências", is_ai_generated: "true" }]);
  assert.deepEqual(containerFields(ig("p", "2026-11-27", { media: [img] }), ["u"], "c"), [{ image_url: "u", caption: "c" }]);
  const reelItem = ig("r", "2026-11-27", { type: "reel", synthetic_media: true, media: [{ path: "media/r.mp4", kind: "video" }] });
  assert.equal(containerFields(reelItem, ["u"], "c")[0].is_ai_generated, "true");
  const carousel = ig("c", "2026-11-27", { type: "carousel", ai_audio: true, media: [alt, img] });
  const children = containerFields(carousel, ["u1", "u2"], "c");
  assert.ok(children.every((child) => !("is_ai_generated" in child)));
  assert.equal(children[0].alt_text, "Tela de recorrências");
  const fetchImpl = graph();
  await run(setup([carousel]), fetchImpl);
  const parent = fetchImpl.calls.filter((call) => call.url.endsWith("/ig1/media")).at(-1);
  assert.equal(parent.body.get("media_type"), "CAROUSEL");
  assert.equal(parent.body.get("is_ai_generated"), "true");
});
