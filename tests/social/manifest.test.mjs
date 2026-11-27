import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { approveManifest, composeText, imageSize, localIso, main, readProfileConfig, validateManifest, zoneOffset } from "../../shared/scripts/social-manifest.mjs";
import { item, jpeg, manifest, NOW, png, sink, tempDir, writeManifest } from "./helpers.mjs";

const files = () => tempDir({ "media/card.png": png(1080, 1350), "media/card.jpg": jpeg(1080, 1350), "media/wide.jpg": jpeg(2000, 1000), "media/reel.mp4": "mp4" });
const validate = (data, dir, options = {}) => validateManifest(data, { manifestDir: dir, now: NOW, ...options });

test("a valid Facebook batch has no errors", () => {
  assert.deepEqual(validate(manifest("facebook", [item()]), files(), { forPublish: true }), []);
});

test("schema errors name the path", () => {
  const data = manifest("facebook", [{ ...item(), type: "tweet", extra: 1 }]);
  const errors = validate(data, files());
  assert.ok(errors.some((e) => e.includes("$.items[0].type")));
  assert.ok(errors.some((e) => e.includes("unknown property extra")));
});

test("publish_at needs an offset and must match the date", () => {
  const errors = validate(manifest("facebook", [item({ publish_at: "2026-12-01T12:30:00Z" })]), files());
  assert.ok(errors.some((e) => e.includes("publish_at")));
});

test("Facebook scheduling window is 10 minutes to 30 days at publish time", () => {
  const dir = files();
  const soon = item({ date: "2026-11-27", publish_at: "2026-11-27T12:05:00-03:00" });
  const late = item({ id: "late", date: "2027-01-10", publish_at: "2027-01-10T12:00:00-03:00" });
  const errors = validate(manifest("facebook", [soon, late]), dir, { forPublish: true });
  assert.equal(errors.filter((e) => e.includes("10 minutes and 30 days")).length, 2);
  assert.equal(validate(manifest("facebook", [soon, late]), dir).filter((e) => e.includes("10 minutes")).length, 0);
});

test("for-publish requires approval", () => {
  const data = manifest("facebook", [item()], { approval: { status: "pending", by: null, at: null, revision: null } });
  assert.ok(validate(data, files(), { forPublish: true }).some((e) => e.includes("not approved")));
});

test("reels must be 9:16, 3 to 90 s on Facebook, at most 30 per day", () => {
  const reel = (id, extra = {}) => item({ id, type: "reel", media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 30, ...extra }] });
  const dir = files();
  assert.deepEqual(validate(manifest("facebook", [reel("ok")]), dir), []);
  assert.ok(validate(manifest("facebook", [reel("long", { duration: 120 })]), dir).some((e) => e.includes("outside 3 to 90")));
  assert.ok(validate(manifest("facebook", [reel("wide", { width: 1920, height: 1080 })]), dir).some((e) => e.includes("9:16")));
  const many = Array.from({ length: 31 }, (_, i) => reel(`r${i}`));
  assert.ok(validate(manifest("facebook", many), dir).some((e) => e.includes("more than 30 reels")));
});

test("Instagram rejects scheduling, PNG images and ratios outside 4:5 to 1.91:1", () => {
  const dir = files();
  const base = { publish_at: null, scheduled: false, media: [{ path: "media/card.jpg", kind: "image", width: 1080, height: 1350 }] };
  assert.deepEqual(validate(manifest("instagram", [item({ ...base, id: "ok" })]), dir), []);
  const errors = validate(manifest("instagram", [item({ ...base, id: "sched", scheduled: true, publish_at: "2026-11-30T12:00:00-03:00" }), item({ ...base, id: "png", media: [{ path: "media/card.png", kind: "image", width: 1080, height: 1350 }] }), item({ ...base, id: "tall", media: [{ path: "media/card.jpg", kind: "image", width: 1080, height: 1920 }] })]), dir);
  assert.ok(errors.some((e) => e.startsWith("sched:") && e.includes("no scheduling")));
  assert.ok(errors.some((e) => e.startsWith("png:") && e.includes("JPEG")));
  assert.ok(errors.some((e) => e.startsWith("tall:") && e.includes("aspect ratio")));
});

test("Instagram carousels hold 2 to 20 items and with_stories must name story items", () => {
  const dir = files();
  const img = { path: "media/card.jpg", kind: "image", width: 1080, height: 1350 };
  const one = item({ id: "c1", type: "carousel", publish_at: null, scheduled: false, media: [img], with_stories: ["c2"] });
  const errors = validate(manifest("instagram", [one, item({ id: "c2", type: "photo", publish_at: null, scheduled: false, media: [img] })]), dir);
  assert.ok(errors.some((e) => e.includes("2 to 20")));
  assert.ok(errors.some((e) => e.includes("not a story item")));
});

test("YouTube needs a title, one video, and Shorts at most 180 s and vertical", () => {
  const dir = files();
  const short = (extra) => item({ type: "short", title: "Título", description: "Descrição", caption: null, media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 30 }], ...extra });
  assert.deepEqual(validate(manifest("youtube", [short({ id: "ok" })]), dir), []);
  const errors = validate(manifest("youtube", [short({ id: "notitle", title: null }), short({ id: "long", media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 200 }] }), short({ id: "angle", title: "a <b>" })]), dir);
  assert.ok(errors.some((e) => e.startsWith("notitle:") && e.includes("title is required")));
  assert.ok(errors.some((e) => e.startsWith("long:") && e.includes("180")));
  assert.ok(errors.some((e) => e.startsWith("angle:") && e.includes("< or >")));
});

test("media paths cannot leave the batch directory and must exist", () => {
  const errors = validate(manifest("facebook", [item({ media: [{ path: "../secret.png", kind: "image" }] }), item({ id: "missing", media: [{ path: "media/nope.png", kind: "image" }] })]), files());
  assert.ok(errors.some((e) => e.includes("inside the batch directory")));
  assert.ok(errors.some((e) => e.includes("file not found: media/nope.png")));
});

test("composeText appends link, credits and hashtags once, per platform", () => {
  const entry = item({ caption: "Texto. #NFSe", link: "https://example.com", credits: "Créditos\nMúsica: X", hashtags: ["#NFSe", "#MEI"] });
  assert.equal(composeText(entry, "facebook"), "Texto. #NFSe\n\nhttps://example.com\n\nCréditos\nMúsica: X\n\n#MEI");
  assert.equal(composeText(entry, "instagram"), "Texto. #NFSe\n\nCréditos\nMúsica: X\n\n#MEI");
  assert.equal(composeText({ ...entry, type: "post" }, "facebook").includes("https://example.com"), false);
  assert.equal(composeText({ ...entry, description: "Desc" }, "youtube"), "Desc\n\nhttps://example.com\n\nCréditos\nMúsica: X\n\n#NFSe #MEI");
});

test("approve records who and when", () => {
  const data = approveManifest(manifest("facebook", [item()], { approval: { status: "pending" } }), { by: "ana", at: NOW });
  assert.deepEqual(data.approval, { status: "approved", by: "ana", at: NOW.toISOString(), revision: 1 });
});

test("time zone helpers give the local offset, including DST", () => {
  assert.equal(zoneOffset("America/Sao_Paulo", new Date("2026-12-01T15:00:00Z")), "-03:00");
  assert.equal(localIso("2026-07-01", "09:00", "America/New_York"), "2026-07-01T09:00:00-04:00");
  assert.equal(localIso("2026-12-01", "09:00", "America/New_York"), "2026-12-01T09:00:00-05:00");
  assert.equal(localIso("2026-12-01", "12:30", "UTC"), "2026-12-01T12:30:00+00:00");
});

test("imageSize reads PNG and JPEG headers", () => {
  const dir = files();
  assert.deepEqual(imageSize(join(dir, "media/card.png")), { width: 1080, height: 1350, format: "png" });
  assert.deepEqual(imageSize(join(dir, "media/wide.jpg")), { width: 2000, height: 1000, format: "jpeg" });
});

test("readProfileConfig takes the json block under Parameters", () => {
  const dir = tempDir({ "profile.md": "# P\n\n```json\n{\"wrong\":1}\n```\n\n## Parameters\n\nText.\n\n```json\n{\"language\":\"en\"}\n```\n" });
  assert.deepEqual(readProfileConfig(join(dir, "profile.md")), { language: "en" });
});

test("CLI validate exits 1 with errors and 0 when valid; config prints merged platform values", () => {
  const dir = files();
  const good = writeManifest(dir, manifest("facebook", [item()]));
  assert.equal(main(["validate", good, "--now", NOW.toISOString()], { out: sink(), err: sink() }), 0);
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify(manifest("facebook", [item({ type: "story" })])));
  const err = sink();
  assert.equal(main(["validate", bad], { out: sink(), err }), 1);
  assert.match(err.text(), /not supported on facebook/);
  const profile = join(dir, "p.md");
  writeFileSync(profile, "## Parameters\n```json\n{\"timezone\":\"UTC\",\"review\":{\"label\":\"mk\"},\"platforms\":{\"instagram\":{\"times\":[\"12:00\"]}}}\n```\n");
  const out = sink();
  assert.equal(main(["config", profile, "--platform", "instagram", "--key", "review.label"], { out, err: sink() }), 0);
  assert.equal(out.text().trim(), "mk");
});

test("links to the profile's domains need the profile UTM", async () => {
  const { utmErrors } = await import("../../shared/scripts/social-manifest.mjs");
  const config = { site_domains: ["example.com"], utm: { source: "{platform}", medium: "social", campaign: "organic-{theme}" } };
  const ok = item({ caption: "Veja https://www.example.com/?utm_source=facebook&utm_medium=social&utm_campaign=organic-lote#a e https://other.org/x" });
  const bad = item({ id: "bad", caption: "Veja https://example.com/#a?utm_source=facebook" });
  const wrong = item({ id: "wrong", caption: "https://example.com/?utm_source=instagram&utm_medium=social&utm_campaign=organic-lote" });
  assert.deepEqual(utmErrors(manifest("facebook", [ok]), config), []);
  const errors = utmErrors(manifest("facebook", [bad, wrong]), config);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^bad: link without the profile UTM \(utm_source=facebook&utm_medium=social&utm_campaign=organic-\{theme\}\)/);
  assert.deepEqual(utmErrors(manifest("facebook", [bad]), {}), []);
});
