import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { aiDisclosure, approveManifest, assignVoices, composeText, imageSize, isAiGenerated, lastVoice, localIso, main, nextVoice, readProfileConfig, ttsConfig, validateManifest, zoneOffset } from "../../shared/scripts/social-manifest.mjs";
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

test("music Shorts over 60 s are refused; Facebook Reels schedule at most 29 days ahead", () => {
  const dir = files();
  const music = { title: "T", license: "CC0", license_url: "https://x.example", evidence: "E", sha256: "c".repeat(64) };
  const short = (duration, extra = {}) => item({ type: "short", title: "T", caption: null, description: "D", media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration }], ...extra });
  assert.ok(validate(manifest("youtube", [short(70, { music })]), dir).some((e) => e.includes("Shorts with music must be at most 60 s")));
  assert.deepEqual(validate(manifest("youtube", [short(70)]), dir), []);
  const reel = item({ type: "reel", date: "2026-12-27", publish_at: "2026-12-27T12:00:00-03:00", media: [{ path: "media/reel.mp4", kind: "video", width: 1080, height: 1920, duration: 30 }] });
  assert.ok(validate(manifest("facebook", [reel]), dir, { forPublish: true }).some((e) => e.includes("10 minutes and 29 days")));
  const photo = item({ date: "2026-12-27", publish_at: "2026-12-27T11:00:00-03:00" });
  assert.deepEqual(validate(manifest("facebook", [photo]), dir, { forPublish: true }), []);
});

test("Instagram allows at most 5 hashtags", () => {
  const data = manifest("instagram", [item({ publish_at: null, scheduled: false, media: [{ path: "media/card.jpg", kind: "image", width: 1080, height: 1350 }], hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] })]);
  assert.ok(validate(data, files()).some((e) => e.includes("more than 5 hashtags")));
});

test("the narration disclosure names the TTS engine; the AI label does not depend on it", () => {
  assert.equal(aiDisclosure({ ai_audio: true }), "Narração com voz sintética (Piper TTS).");
  assert.equal(aiDisclosure({ ai_audio: true, ai_audio_engine: "piper" }, "en"), "Narrated with a synthetic voice (Piper TTS).");
  assert.equal(aiDisclosure({ ai_audio: true, ai_audio_engine: "azure" }), "Narração com voz sintética (Azure AI Speech).");
  assert.equal(aiDisclosure({ ai_audio: true, ai_audio_engine: "azure", synthetic_media: true }, "en"), "Narrated with a synthetic voice (Azure AI Speech). Contains AI-generated footage.");
  assert.equal(aiDisclosure({ ai_audio: false, ai_audio_engine: "azure" }), null);
  assert.equal(isAiGenerated({ ai_audio: true, ai_audio_engine: "azure" }), true);
  assert.equal(composeText({ caption: "Texto", ai_audio: true, ai_audio_engine: "azure", type: "video" }, "linkedin"), "Texto\n\nNarração com voz sintética (Azure AI Speech).");
});

test("manifest items record the narration voice and engine", () => {
  const dir = files();
  assert.deepEqual(validate(manifest("facebook", [item({ voice: "pt-BR-FranciscaNeural", ai_audio: true, ai_audio_engine: "azure" })]), dir), []);
  assert.match(validate(manifest("facebook", [item({ ai_audio_engine: "polly" })]), dir).join("\n"), /ai_audio_engine: must be one of/);
});

test("voices alternate from the one the previous batch ended with", () => {
  const voices = ["a", "b"];
  assert.equal(nextVoice(voices, null), "a");
  assert.equal(nextVoice(voices, "a"), "b");
  assert.equal(nextVoice(voices, "b"), "a");
  assert.equal(nextVoice(voices, "gone"), "a");
  assert.equal(nextVoice(["a", "b", "c"], "c"), "a");
  assert.equal(nextVoice([], "a"), null);
  assert.deepEqual(assignVoices([{ id: 1 }, { id: 2 }, { id: 3 }], voices, "a").map((entry) => entry.voice), ["b", "a", "b"]);
  assert.deepEqual(assignVoices([{ id: 1 }], voices, null).map((entry) => entry.voice), ["a"]);
  const previous = { items: [
    { id: "late", date: "2026-11-27", publish_at: "2026-11-27T18:00:00-03:00", voice: "b" },
    { id: "early", date: "2026-11-26", publish_at: "2026-11-26T18:00:00-03:00", voice: "a" },
    { id: "card", date: "2026-11-28", publish_at: "2026-11-28T18:00:00-03:00" },
  ] };
  assert.equal(lastVoice(previous), "b");
  assert.equal(lastVoice({ items: [{ id: "x", date: "2026-11-26", publish_at: null, voice: "a" }, { id: "y", date: "2026-11-27", publish_at: null, voice: "b" }] }), "b");
  assert.equal(lastVoice({ items: [] }), null);
  assert.deepEqual(ttsConfig(null), { engine: "piper", voices: null, rotation: null });
  assert.deepEqual(ttsConfig({ video: { tts: { engine: "azure", voices: voices, rotation: "alternate" } } }), { engine: "azure", voices, rotation: "alternate" });
  assert.throws(() => ttsConfig({ video: { tts: { voices: "a" } } }), /list of voice ids/);
  assert.throws(() => ttsConfig({ video: { tts: { voices, rotation: "random" } } }), /video\.tts\.rotation must be alternate or omitted \(got random\)/);
  assert.throws(() => ttsConfig({ video: { tts: { engine: "polly" } } }), /video\.tts\.engine must be one of piper, azure/);
  assert.equal(ttsConfig({ video: { tts: { voices: ["a"], rotation: null } } }).rotation, null);
  assert.throws(() => ttsConfig({ video: { tts: { voices } } }), /several voices, so video\.tts\.rotation must be "alternate"/);
});

test("review.drive_run_folder records the run folder id and a YYYY-MM-DD HH-mm name", () => {
  const ok = manifest("facebook", [item()]);
  ok.review.drive_run_folder = { id: "F1", name: "2026-11-28 04-47", url: "https://drive.google.com/drive/folders/F1" };
  assert.deepEqual(validate(ok, files()), []);
  assert.deepEqual(validate(manifest("facebook", [item()], { review: { revision: 1, drive_run_folder: null } }), files()), []);
  const bad = manifest("facebook", [item()]);
  bad.review.drive_run_folder = { name: "2026-11-28 04:47", extra: true };
  const errors = validate(bad, files());
  assert.ok(errors.some((error) => error.includes("drive_run_folder: missing id")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("drive_run_folder.name: does not match")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("drive_run_folder: unknown property extra")), errors.join("\n"));
});

test("usage ledger entries validate in the manifest and in usage.jsonl", async () => {
  const { appendUsage, readUsage } = await import("../../shared/scripts/social-manifest.mjs");
  const ok = manifest("facebook", [item()], { usage: [{ id: "u1", at: "2026-11-28T07:47:00.000Z", service: "azure-speech", unit: "characters", quantity: 12, voice: "pt-BR-FranciscaNeural", revision: 1 }] });
  assert.deepEqual(validate(ok, files()), []);
  const bad = manifest("facebook", [item()], { usage: [{ id: "u1", service: "azure-speech", unit: "characters", quantity: -1, tokens: 3 }] });
  assert.deepEqual(validate(bad, files()).filter((error) => error.includes("usage")), ["$.usage[0].quantity: below 0", "$.usage[0]: unknown property tokens"]);
  const dir = tempDir({});
  const ledger = join(dir, "batch", "usage.jsonl");
  assert.deepEqual(readUsage(ledger), []);
  appendUsage(ledger, { service: "azure-speech", unit: "characters", quantity: 3 }, { id: "a", now: NOW });
  assert.deepEqual(readUsage(ledger), [{ id: "a", at: "2026-11-27T15:00:00.000Z", service: "azure-speech", unit: "characters", quantity: 3 }]);
  assert.throws(() => appendUsage(ledger, { service: "azure-speech", unit: "characters", quantity: "3" }), /quantity must be a number >= 0/);
  writeFileSync(ledger, "{nope\n");
  assert.throws(() => readUsage(ledger), /usage.jsonl:1: invalid JSON/);
});
