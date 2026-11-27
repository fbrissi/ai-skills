import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GraphClient, redact } from "../../.rulesync/skills/facebook-publish/scripts/graph.mjs";
import { main, plan, publish } from "../../.rulesync/skills/facebook-publish/scripts/publish-facebook.mjs";
import { fakeFetch, item, json, manifest, NOW, png, sink, tempDir, writeManifest } from "./helpers.mjs";

const TOKEN = "page-token-secret-value";
const setup = (items, overrides) => {
  const dir = tempDir({ "media/card.png": png(1080, 1350), "media/b.png": png(1080, 1350), "media/reel.mp4": "mp4-bytes" });
  const data = manifest("facebook", items, overrides);
  return { dir, data, path: writeManifest(dir, data) };
};
const graph = () =>
  fakeFetch([
    [(url) => url.endsWith("/123/photos"), (_, call) => ({ id: `photo-${call.body.get("published")}` })],
    [(url) => url.endsWith("/123/feed"), () => ({ id: "123_post" })],
    [(url) => url.includes("/123/video_reels"), (_, call) => (new URLSearchParams(call.body).get("upload_phase") === "start" ? { video_id: "v1", upload_url: "x" } : { success: true })],
    [(url) => url.startsWith("https://rupload.facebook.com/"), () => ({ success: true })],
  ]);
const run = (data, dir, path, client, extra = {}) => publish(data, { manifestDir: dir, manifestPath: path, client, pageId: "123", execute: true, now: NOW, out: sink(), ...extra });

test("dry run validates without calling the Graph API", async () => {
  const { dir, data, path } = setup([item()], { approval: { status: "pending" } });
  const out = sink();
  await publish(data, { manifestDir: dir, manifestPath: path, client: null, pageId: "123", execute: false, now: NOW, out });
  assert.match(out.text(), /dry run: 2026-11-30-facebook-1 photo at 2026-11-30T12:30:00-03:00 with 1 image/);
});

test("execute refuses a batch that is not approved", async () => {
  const { dir, data, path } = setup([item()], { approval: { status: "pending" } });
  const fetchImpl = graph();
  await assert.rejects(run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl })), /not approved/);
  assert.equal(fetchImpl.calls.length, 0);
});

test("photo posts upload temporary photos and schedule the feed post", async () => {
  const { dir, data, path } = setup([item({ type: "carousel", media: [{ path: "media/card.png", kind: "image" }, { path: "media/b.png", kind: "image" }] })]);
  const fetchImpl = graph();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }));
  const [photo1, photo2, feed] = fetchImpl.calls;
  assert.equal(photo1.body.get("temporary"), "true");
  assert.equal(photo2.body.get("published"), "false");
  const fields = new URLSearchParams(feed.body);
  assert.equal(fields.get("published"), "false");
  assert.equal(fields.get("unpublished_content_type"), "SCHEDULED");
  assert.equal(fields.get("scheduled_publish_time"), String(Date.parse("2026-11-30T12:30:00-03:00") / 1000));
  assert.equal(fields.get("attached_media[1]"), JSON.stringify({ media_fbid: "photo-false" }));
  assert.match(fields.get("message"), /#NFSe$/);
  assert.equal(feed.headers.authorization, `Bearer ${TOKEN}`);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(saved.state["2026-11-30-facebook-1"].status, "scheduled");
  assert.equal(saved.state["2026-11-30-facebook-1"].remote_id, "123_post");
});

test("link posts send the link apart and no media", async () => {
  const { dir, data, path } = setup([item({ type: "post", media: [], link: "https://example.com/?utm_source=facebook" })]);
  const step = plan(data.items[0], { pageId: "123", manifestDir: dir });
  assert.equal(step.fields.link, "https://example.com/?utm_source=facebook");
  assert.equal(step.photos.length, 0);
  const fetchImpl = graph();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }));
  assert.equal(fetchImpl.calls.length, 1);
});

test("reels go through start, upload and finish with SCHEDULED", async () => {
  const reel = item({ type: "reel", title: "Lote", media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 20 }] });
  const { dir, data, path } = setup([reel]);
  const fetchImpl = graph();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }));
  const [start, upload, finish] = fetchImpl.calls;
  assert.equal(new URLSearchParams(start.body).get("upload_phase"), "start");
  assert.equal(upload.url, "https://rupload.facebook.com/video-upload/v24.0/v1");
  assert.equal(upload.headers.authorization, `OAuth ${TOKEN}`);
  assert.equal(upload.headers.file_size, String("mp4-bytes".length));
  const fields = new URLSearchParams(finish.body);
  assert.equal(fields.get("video_state"), "SCHEDULED");
  assert.equal(fields.get("video_id"), "v1");
  assert.equal(fields.get("title"), "Lote");
});

test("a re-run skips what is already scheduled", async () => {
  const { dir, data, path } = setup([item(), item({ id: "second", date: "2026-12-01", publish_at: "2026-12-01T12:30:00-03:00" })]);
  data.state["2026-11-30-facebook-1"] = { status: "scheduled", remote_id: "old", at: NOW.toISOString() };
  const fetchImpl = graph();
  const out = sink();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }), { out });
  assert.match(out.text(), /already scheduled: 2026-11-30-facebook-1 \(old\)/);
  assert.equal(fetchImpl.calls.filter((call) => call.url.endsWith("/feed")).length, 1);
});

test("an API error is recorded as failed, stops the run and never shows the token", async () => {
  const { dir, data, path } = setup([item()]);
  const fetchImpl = fakeFetch([[() => true, () => json({ error: { message: `bad token ${TOKEN}`, code: 190 } }, 400)]]);
  await assert.rejects(run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl })), (error) => !error.message.includes(TOKEN) && /code 190/.test(error.message));
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(saved.state["2026-11-30-facebook-1"].status, "failed");
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
});

test("usePageToken swaps a user token for the Page token", async () => {
  const fetchImpl = fakeFetch([[(url) => url.includes("/123?fields=access_token"), () => ({ access_token: "page-token-from-graph" })]]);
  const client = await new GraphClient({ token: "user-token-value", fetchImpl }).usePageToken("123");
  assert.equal(client.token, "page-token-from-graph");
  assert.equal(redact("x access_token=abc&y", []), "x access_token=[redacted]&y");
});

test("CLI requires page credentials to execute", async () => {
  const { path } = setup([item()]);
  await assert.rejects(main([path, "--execute"], { env: {}, out: sink() }), /FACEBOOK_PAGE_ID/);
});

test("a lost response on the final call leaves the item unknown; it is skipped until --retry names it", async () => {
  const { dir, data, path } = setup([item({ type: "post", media: [] })]);
  const lost = fakeFetch([[() => true, () => { throw new Error("socket hang up"); }]]);
  await assert.rejects(run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl: lost })), /network error/);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(saved.state["2026-11-30-facebook-1"].status, "unknown");
  const again = graph();
  const out = sink();
  await run(saved, dir, path, new GraphClient({ token: TOKEN, fetchImpl: again }), { out });
  assert.equal(again.calls.length, 0);
  assert.match(out.text(), /needs a manual check: 2026-11-30-facebook-1 .*--retry 2026-11-30-facebook-1/);
  await run(saved, dir, path, new GraphClient({ token: TOKEN, fetchImpl: again }), { retry: ["2026-11-30-facebook-1"] });
  assert.equal(JSON.parse(readFileSync(path, "utf8")).state["2026-11-30-facebook-1"].status, "scheduled");
});

test("a late approval skips stale items and still schedules the rest", async () => {
  const { dir, data, path } = setup([item({ id: "late", date: "2026-11-27", publish_at: "2026-11-27T12:05:00-03:00" }), item({ id: "next", date: "2026-12-01", publish_at: "2026-12-01T12:30:00-03:00" })]);
  const fetchImpl = graph();
  const out = sink();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }), { out });
  assert.match(out.text(), /stale: late publish_at 2026-11-27T12:05:00-03:00/);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(saved.state.next.status, "scheduled");
  assert.equal(saved.state.late, undefined);
});

test("publishing requires the approval to match the current revision", async () => {
  const { dir, data, path } = setup([item()], { review: { revision: 2 }, approval: { status: "approved", by: "ana", at: NOW.toISOString(), revision: 1 } });
  await assert.rejects(run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl: graph() })), /approval is for revision 1, but the batch is at revision 2/);
});

test("AI narration or footage sends is_ai_generated on the Reel, and copyright matches become warnings", async () => {
  const reel = item({ type: "reel", ai_audio: true, media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 20 }] });
  const { dir, data, path } = setup([reel]);
  const base = graph();
  const fetchImpl = async (url, init) => (String(url).includes("/v1?fields=copyright_check_information") ? new Response(JSON.stringify({ copyright_check_information: { status: { status: "complete", matches_found: true } } })) : base(url, init));
  const out = sink();
  await run(data, dir, path, new GraphClient({ token: TOKEN, fetchImpl }), { out });
  const finish = base.calls.find((call) => call.body instanceof URLSearchParams && call.body.get("upload_phase") === "finish");
  assert.equal(new URLSearchParams(finish.body).get("is_ai_generated"), "true");
  const state = JSON.parse(readFileSync(path, "utf8")).state["2026-11-30-facebook-1"];
  assert.equal(state.extra.copyright_check, "complete");
  assert.match(state.extra.warnings[0], /copyright check found matches/);
  assert.match(out.text(), /warnings: copyright check found matches/);
  const plain = plan(item({ type: "reel", media: [{ path: "media/reel.mp4", kind: "video" }] }), { pageId: "123", manifestDir: dir });
  assert.equal(plain.aiGenerated, false);
});
