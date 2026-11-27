import assert from "node:assert/strict";
import { test } from "node:test";
import { credits, findTrack } from "../../.rulesync/skills/video-shorts/scripts/credits.mjs";
import { buildProps, disclaimerErrors, footageFitError, specErrors } from "../../.rulesync/skills/video-shorts/scripts/render.mjs";
import { sceneTiming } from "../../.rulesync/skills/video-shorts/scripts/timing.mjs";
import { sceneKey, voiceSettings } from "../../.rulesync/skills/video-shorts/scripts/voice.mjs";
import { join } from "node:path";
import { png, tempDir } from "./helpers.mjs";

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

const DISCLAIMER = "Alíquotas e tributação: informadas por você ou pelo seu contador.";
const screenProfile = { video: { screen_disclaimer: DISCLAIMER, footnote: "Telas reais com dados fictícios" } };

test("product screens always carry the profile's screen disclaimer; the footnote falls back to the profile", () => {
  const root = tempDir({ "shot.png": png(1000, 720) });
  const spec = { id: "v", scenes: [{ id: "hook", kind: "hook", title: "Todo mês?", voice: "Todo mês?" }, { id: "tela", kind: "screen", image: "shot.png", voice: "Configure uma vez." }, { id: "cta", kind: "cta", title: "Teste", voice: "Teste." }] };
  const props = buildProps(spec, { config: screenProfile, root, jobDir: join(root, "job"), jobPublic: "job/v", voice: {}, music: null });
  assert.deepEqual(props.scenes.map((scene) => [scene.id, scene.disclaimer ?? null]), [["hook", null], ["tela", DISCLAIMER], ["cta", null]]);
  assert.equal(props.footnote, "Telas reais com dados fictícios");
  assert.deepEqual(disclaimerErrors(props, screenProfile), []);
  const bare = buildProps(spec, { config: null, root, jobDir: join(root, "job2"), jobPublic: "job/v", voice: {}, music: null });
  assert.equal(bare.scenes[1].disclaimer, undefined);
  assert.deepEqual(disclaimerErrors(bare, screenProfile), ["scene tela: shows a product screen without the profile's video.screen_disclaimer"]);
  const synthetic = { ...bare, scenes: [{ id: "clip", kind: "footage", synthetic: true }] };
  assert.deepEqual(disclaimerErrors(synthetic, screenProfile), []);
  assert.deepEqual(disclaimerErrors({ scenes: [{ id: "rec", kind: "footage" }] }, screenProfile), ["scene rec: shows a product screen without the profile's video.screen_disclaimer"]);
});

test("a screen disclaimer that cannot fit one line under the screen is refused", () => {
  const root = tempDir({ "shot.png": png(1000, 720) });
  const spec = { id: "v", scenes: [{ id: "tela", kind: "screen", image: "shot.png" }] };
  assert.deepEqual(specErrors(spec, root, screenProfile), []);
  assert.deepEqual(specErrors(spec, root, { video: { screen_disclaimer: "x".repeat(81) } }), ["video.screen_disclaimer has 81 characters; keep it within 80 so it fits one line under the screen"]);
});

test("zoom boxes must fit the screen frame so their edges never cut UI text", () => {
  const root = tempDir({ "wide.png": png(1440, 900), "exact.png": png(1440, 1037) });
  const scene = (extra) => ({ id: "tela", kind: "screen", image: "wide.png", ...extra });
  assert.deepEqual(specErrors({ id: "v", scenes: [scene({})] }, root), ["scene tela: focus box 1440x900 does not fit the 1000x720 screen frame: the camera shows at most 1250x900 image pixels at that zoom, so the box edges (labels, sidebar items, buttons) would be cut; use a box with the frame's 1000:720 aspect inside the image"]);
  assert.deepEqual(specErrors({ id: "v", scenes: [scene({ focus: { x: 0, y: 100, w: 700, h: 504 } })] }, root), []);
  assert.deepEqual(specErrors({ id: "v", scenes: [scene({ focus: { x: 0, y: 0, w: 700, h: 504 }, pan_to: { x: 0, y: 0, w: 1440, h: 600 } })] }, root), ["scene tela: pan_to box 1440x600 does not fit the 1000x720 screen frame: the camera shows at most 1250x900 image pixels at that zoom, so the box edges (labels, sidebar items, buttons) would be cut; use a box with the frame's 1000:720 aspect inside the image"]);
  assert.deepEqual(specErrors({ id: "v", scenes: [scene({ focus: { x: 1000, y: 0, w: 700, h: 504 } })] }, root), ["scene tela: focus box goes past the image (1440x900)"]);
  assert.deepEqual(specErrors({ id: "v", scenes: [{ id: "tela", kind: "screen", image: "exact.png" }] }, root), []);
});

test("footage must be cropped to the frame aspect, or the frame cuts its sides", () => {
  const root = tempDir({ "rec.mp4": "x" });
  assert.deepEqual(specErrors({ id: "v", scenes: [{ id: "f", kind: "footage", video: "rec.mp4", crop: "1000:720:0:0" }] }, root), []);
  assert.deepEqual(specErrors({ id: "v", scenes: [{ id: "f", kind: "footage", video: "rec.mp4", crop: "1920:1080:0:0" }] }, root), ["scene f: footage 1920x1080 is cut to the 1000:720 screen frame (22% of its width is lost); crop it to that aspect (for example 1500:1080:x:y)"]);
  assert.equal(footageFitError("f", 1386, 1000), null);
});
