import assert from "node:assert/strict";
import { test } from "node:test";
import { credits, findTrack } from "../../.rulesync/skills/video-shorts/scripts/credits.mjs";
import { specErrors } from "../../.rulesync/skills/video-shorts/scripts/render.mjs";
import { sceneTiming } from "../../.rulesync/skills/video-shorts/scripts/timing.mjs";
import { sceneKey, voiceSettings } from "../../.rulesync/skills/video-shorts/scripts/voice.mjs";
import { tempDir } from "./helpers.mjs";

const config = { language: "pt-BR", video: { music: { tracks: [{ file: "city-sunshine.mp3", title: "City Sunshine", author: "Kevin MacLeod", source: "FreePD", license: "CC0", license_url: "https://freepd.com/", evidence: "DRIVEID", sha256: "d".repeat(64) }] } } };
const noEvidence = { video: { music: { tracks: [{ file: "city-sunshine.mp3", title: "City Sunshine", author: "Kevin MacLeod", source: "FreePD", license: "CC0" }] } } };

test("timing: minimums, voice lead and tail, CTA hold, footage at most 2x", () => {
  assert.deepEqual(sceneTiming({ id: "h", kind: "hook", voice: "" }), { durationInFrames: 72, voiceFrom: 3, voiceFrames: 0, playbackRate: 1 });
  assert.equal(sceneTiming({ id: "s", kind: "screen", voice: "x" }, { voiceSeconds: 6 }).durationInFrames, Math.round((0.25 + 6 + 0.5) * 30));
  assert.equal(sceneTiming({ id: "c", kind: "cta", voice: "x" }, { voiceSeconds: 2 }).durationInFrames, Math.round((5.5 + 0.6) * 30));
  const clip = sceneTiming({ id: "f", kind: "footage", voice: "x" }, { voiceSeconds: 2, clipSeconds: 20 });
  assert.equal(clip.durationInFrames, 300);
  assert.equal(clip.playbackRate, 2);
  assert.throws(() => sceneTiming({ id: "x", kind: "avatar" }), /unknown scene kind/);
});

test("credits keep the Piper license chain and the music credit", () => {
  const text = credits({ config, music: "media/city-sunshine.mp3" });
  assert.match(text, /^Créditos\nLocução: voz sintética gerada com Piper TTS/);
  assert.match(text, /CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)/);
  assert.match(text, /\nMúsica: "City Sunshine", Kevin MacLeod \(FreePD, CC0\)\.$/);
  assert.match(credits({ config, lang: "en", music: "City Sunshine" }), /^Credits\nVoice-over: synthetic voice/);
  assert.throws(() => findTrack(config, "unknown.mp3"), /not listed in video.music.tracks/);
  assert.throws(() => credits({ config, voice: "en_US-other-medium" }), /no credit text for voice/);
});

test("specs need real screens: no image, no recording, or generated UI is refused", () => {
  const root = tempDir({ "shot.png": "x" });
  const errors = specErrors({ id: "v", scenes: [{ id: "a", kind: "screen" }, { id: "b", kind: "footage" }, { id: "c", kind: "screen", image: "shot.png", generated_ui: true }, { id: "d", kind: "screen", image: "missing.png" }], music: "nope.mp3" }, root);
  assert.deepEqual(errors, [
    "scene a: screen scenes need an image (a real screenshot the project provides)",
    "scene b: footage scenes need a video (a real recording or a supplied clip)",
    "scene c: AI-generated product UI is not allowed; use a real screenshot or recording",
    "scene d: file not found: missing.png",
    "music not found: nope.mp3 (download it with drive.mjs download-folder)",
  ]);
});

test("voice settings come from spec, profile, then defaults; the cache key changes with them", () => {
  assert.deepEqual(voiceSettings({}, null, {}), { voice: "pt_BR-faber-medium", lengthScale: "0.92" });
  assert.deepEqual(voiceSettings({ length_scale: 1 }, { video: { voice: "en_US-x" } }, {}), { voice: "en_US-x", lengthScale: "1" });
  assert.notEqual(sceneKey("a", { voice: "v", lengthScale: "1" }), sceneKey("a", { voice: "v", lengthScale: "0.9" }));
});

test("music needs license evidence and must match its recorded sha256", async () => {
  const { musicEntry, sha256File } = await import("../../.rulesync/skills/video-shorts/scripts/credits.mjs");
  const { join } = await import("node:path");
  const root = tempDir({ "city-sunshine.mp3": "mp3-bytes" });
  const file = join(root, "city-sunshine.mp3");
  const track = { file: "city-sunshine.mp3", title: "City Sunshine", author: "Kevin MacLeod", source: "FreePD", license: "CC0", license_url: "https://freepd.com/", evidence: "DRIVEID", sha256: sha256File(file) };
  assert.deepEqual(musicEntry({ video: { music: { tracks: [track] } } }, file), track);
  assert.throws(() => musicEntry({ video: { music: { tracks: [{ ...track, sha256: "b".repeat(64) }] } } }, file), /does not match the sha256/);
  assert.throws(() => musicEntry(noEvidence, file), /needs license_url, evidence, sha256/);
});
