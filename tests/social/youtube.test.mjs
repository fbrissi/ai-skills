import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { accessToken } from "../../.rulesync/skills/youtube-publish/scripts/google-auth.mjs";
import { publish, uploadsInLast24h, videoResource } from "../../.rulesync/skills/youtube-publish/scripts/publish-youtube.mjs";
import { fakeFetch, item, json, manifest, NOW, sink, tempDir, writeManifest } from "./helpers.mjs";

const short = (id, extra = {}) =>
  item({ id, type: "short", title: "Lote do mês", caption: null, description: "Emita o lote.", link: "https://example.com/?utm_source=youtube", tags: ["nfse"], media: [{ path: "media/v.mp4", kind: "video", width: 1080, height: 1920, duration: 30 }], ...extra });

function setup(items) {
  const dir = tempDir({ "media/v.mp4": "video-bytes", "media/t.jpg": "jpg", "media/c.srt": "1\n00:00:00,000 --> 00:00:01,000\nOi\n" });
  const data = manifest("youtube", items);
  return { dir, data, path: writeManifest(dir, data) };
}

function youtube({ failInsert = null, failThumb = false } = {}) {
  let videos = 0;
  return fakeFetch([
    [(url) => url.includes("/upload/youtube/v3/videos?uploadType=resumable"), () => (failInsert ? json({ error: { message: failInsert } }, 403) : new Response("", { status: 200, headers: { location: "https://upload.example/session" } }))],
    [(url) => url === "https://upload.example/session", () => ({ id: `vid${++videos}` })],
    [(url) => url.includes("/thumbnails/set"), () => (failThumb ? json({ error: { message: "channel not verified" } }, 403) : {})],
    [(url) => url.includes("/playlistItems"), () => ({ id: "pli" })],
    [(url) => url.includes("/upload/youtube/v3/captions"), () => ({ id: "cap" })],
  ]);
}

const run = (s, fetchImpl, extra = {}) => publish(s.data, { manifestDir: s.dir, manifestPath: s.path, api: { fetchImpl, token: "yt-token" }, execute: true, now: NOW, out: sink(), ...extra });

test("scheduled videos upload as private with publishAt; synthetic media is declared", () => {
  const resource = videoResource(short("a", { synthetic_media: true, options: { category_id: "28", made_for_kids: false } }), { language: "pt-BR" });
  assert.deepEqual(resource.status, { privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, publishAt: "2026-11-30T15:30:00.000Z" });
  assert.equal(resource.snippet.categoryId, "28");
  assert.equal(resource.snippet.defaultLanguage, "pt-BR");
  assert.equal(resource.snippet.description, "Emita o lote.\n\nhttps://example.com/?utm_source=youtube\n\n#NFSe");
  const direct = videoResource(short("b", { scheduled: false, visibility: "unlisted" }));
  assert.equal(direct.status.privacyStatus, "unlisted");
  assert.equal(direct.status.publishAt, undefined);
});

test("upload is resumable, then thumbnail, playlist and captions; state is saved", async () => {
  const s = setup([short("a", { thumbnail: "media/t.jpg", options: { playlist_id: "PL1", captions: "media/c.srt", captions_language: "pt-BR" } })]);
  const fetchImpl = youtube();
  await run(s, fetchImpl);
  const [start, put, thumb, playlist, captions] = fetchImpl.calls;
  assert.equal(start.headers["x-upload-content-length"], String("video-bytes".length));
  assert.equal(JSON.parse(start.body).status.privacyStatus, "private");
  assert.equal(put.method, "PUT");
  assert.match(thumb.url, /videoId=vid1/);
  assert.deepEqual(JSON.parse(playlist.body).snippet, { playlistId: "PL1", resourceId: { kind: "youtube#video", videoId: "vid1" } });
  assert.match(captions.headers["content-type"], /^multipart\/related; boundary=/);
  assert.match(captions.body.toString(), /"language":"pt-BR"/);
  const saved = JSON.parse(readFileSync(s.path, "utf8"));
  assert.equal(saved.state.a.status, "scheduled");
  assert.equal(saved.state.a.url, "https://www.youtube.com/shorts/vid1");
});

test("a failed thumbnail is a warning, not a failure, and the video is never uploaded twice", async () => {
  const s = setup([short("a", { thumbnail: "media/t.jpg" })]);
  const out = sink();
  await run(s, youtube({ failThumb: true }), { out });
  assert.match(out.text(), /warnings: thumbnail: thumbnails.set 403: channel not verified/);
  assert.equal(JSON.parse(readFileSync(s.path, "utf8")).state.a.extra.pending_thumbnail, true);
  const again = youtube();
  const out2 = sink();
  await run({ ...s, data: JSON.parse(readFileSync(s.path, "utf8")) }, again, { out: out2 });
  assert.deepEqual(again.calls.map((call) => new URL(call.url).pathname), ["/upload/youtube/v3/thumbnails/set"], "only the pending thumbnail is retried; the video is not uploaded again");
  assert.match(out2.text(), /thumbnail set: a/);
  const saved = JSON.parse(readFileSync(s.path, "utf8")).state.a.extra;
  assert.equal(saved.pending_thumbnail, false);
  assert.deepEqual(saved.warnings, []);
  const third = youtube();
  await run({ ...s, data: JSON.parse(readFileSync(s.path, "utf8")) }, third);
  assert.equal(third.calls.length, 0);
});

test("paid product placement is always declared", () => {
  assert.deepEqual(videoResource(short("a")).paidProductPlacementDetails, { hasPaidProductPlacement: false });
  assert.deepEqual(videoResource(short("b", { options: { paid_product_placement: true } })).paidProductPlacementDetails, { hasPaidProductPlacement: true });
});

test("the insert asks for the paidProductPlacementDetails part", async () => {
  const s = setup([short("a")]);
  const fetchImpl = youtube();
  await run(s, fetchImpl);
  assert.match(fetchImpl.calls[0].url, /part=snippet,status,paidProductPlacementDetails/);
  assert.equal(JSON.parse(fetchImpl.calls[0].body).paidProductPlacementDetails.hasPaidProductPlacement, false);
});

test("the daily upload limit leaves the rest for the next run", async () => {
  const s = setup([short("a"), short("b", { date: "2026-12-01", publish_at: "2026-12-01T12:30:00-03:00" })]);
  const out = sink();
  await run(s, youtube(), { dailyLimit: 1, out });
  assert.match(out.text(), /daily upload limit reached \(1\/1\): b/);
  assert.equal(uploadsInLast24h(JSON.parse(readFileSync(s.path, "utf8")), NOW), 1);
});

test("quota errors stop the run without throwing; other errors throw", async () => {
  const s = setup([short("a")]);
  const out = sink();
  await run(s, youtube({ failInsert: "The request cannot be completed because you have exceeded your quota." }), { out });
  assert.match(out.text(), /quota exceeded: a/);
  const s2 = setup([short("a")]);
  await assert.rejects(run(s2, youtube({ failInsert: "Forbidden" })), /YouTube upload start 403: Forbidden/);
  assert.equal(JSON.parse(readFileSync(s2.path, "utf8")).state.a.status, "failed");
});

test("scheduled videos must go public at publish_at; items under 15 minutes of lead are skipped as stale", async () => {
  await assert.rejects(run(setup([short("a", { visibility: "unlisted" })]), youtube()), /set visibility public/);
  const s = setup([short("b", { date: "2026-11-27", publish_at: "2026-11-27T12:05:00-03:00" })]);
  const out = sink();
  const fetchImpl = youtube();
  await run(s, fetchImpl, { out });
  assert.match(out.text(), /stale: b publish_at/);
  assert.equal(fetchImpl.calls.length, 0);
});

test("refresh token exchange sends the OAuth fields and hides secrets in errors", async () => {
  const ok = fakeFetch([[(url) => url === "https://oauth2.googleapis.com/token", () => ({ access_token: "at" })]]);
  assert.equal(await accessToken({ clientId: "id", clientSecret: "sec", refreshToken: "rt" }, ok), "at");
  assert.equal(ok.calls[0].body.get("grant_type"), "refresh_token");
  const bad = fakeFetch([[() => true, () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)]]);
  await assert.rejects(accessToken({ clientId: "id", clientSecret: "sec", refreshToken: "rt-secret" }, bad), (error) => /invalid_grant/.test(error.message) && !error.message.includes("rt-secret"));
});

test("an upload without a response is unknown and never re-uploaded without --retry", async () => {
  const s = setup([short("a")]);
  const fetchImpl = fakeFetch([
    [(url) => url.includes("uploadType=resumable"), () => new Response("", { status: 200, headers: { location: "https://upload.example/session" } })],
    [(url) => url === "https://upload.example/session", () => { throw new Error("ECONNRESET"); }],
  ]);
  await assert.rejects(run(s, fetchImpl), /no response/);
  const saved = JSON.parse(readFileSync(s.path, "utf8"));
  assert.equal(saved.state.a.status, "unknown");
  const again = youtube();
  const out = sink();
  await run({ ...s, data: saved }, again, { out });
  assert.equal(again.calls.length, 0);
  assert.match(out.text(), /needs a manual check: a/);
});
