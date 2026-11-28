import assert from "node:assert/strict";
import { test } from "node:test";
import { credits, findTrack } from "../../.rulesync/skills/video-shorts/scripts/credits.mjs";
import { buildProps, DEFAULT_MUSIC_VOLUME, musicVolume, disclaimerErrors, edgeCuts, footageFitError, narrationInfo, specErrors, undisclaimedScreens, visibleRect } from "../../.rulesync/skills/video-shorts/scripts/render.mjs";
import { sceneFrames } from "../../.rulesync/skills/video-shorts/scripts/frames.mjs";
import { sceneTiming } from "../../.rulesync/skills/video-shorts/scripts/timing.mjs";
import { azureRequest, escapeXml, main as voiceMain, sceneKey, synthesizeAzure, voiceSettings } from "../../.rulesync/skills/video-shorts/scripts/voice.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  assert.deepEqual(voiceSettings({}, null, {}), { engine: "piper", voice: "pt_BR-faber-medium", lengthScale: "0.92" });
  assert.deepEqual(voiceSettings({ length_scale: 1 }, { video: { voice: "en_US-x" } }, {}), { engine: "piper", voice: "en_US-x", lengthScale: "1" });
  assert.notEqual(sceneKey("a", { voice: "v", lengthScale: "1" }), sceneKey("a", { voice: "v", lengthScale: "0.9" }));
});

const AZURE = { video: { tts: { engine: "azure", voices: ["pt-BR-Macerio:DragonHDLatestNeural", "pt-BR-FranciscaNeural"], rotation: "alternate" } } };
const KEY = "secret-key-123";
const ENV = { AZURE_SPEECH_KEY: KEY, AZURE_SPEECH_REGION: "brazilsouth" };

test("video.tts voices: the spec's voice must be listed, and several voices need one in the spec", () => {
  assert.deepEqual(voiceSettings({ voice: "pt-BR-FranciscaNeural" }, AZURE, {}), { engine: "azure", voice: "pt-BR-FranciscaNeural", lengthScale: null });
  assert.throws(() => voiceSettings({ voice: "pt-BR-AntonioNeural" }, AZURE, {}), /voice pt-BR-AntonioNeural is not in video\.tts\.voices/);
  assert.throws(() => voiceSettings({ id: "v1" }, AZURE, {}), /several voices in video\.tts\.voices.*set "voice" in the spec v1/);
  assert.equal(voiceSettings({}, { video: { tts: { engine: "azure", voices: ["pt-BR-FranciscaNeural"] } } }, {}).voice, "pt-BR-FranciscaNeural");
  assert.deepEqual(voiceSettings({}, { video: { voice: "pt_BR-x", tts: { engine: "piper", voices: ["pt_BR-faber-medium"] } } }, {}), { engine: "piper", voice: "pt_BR-faber-medium", lengthScale: "0.92" });
  assert.throws(() => voiceSettings({}, { video: { tts: { engine: "azure" } } }, {}), /needs a voice/);
  assert.throws(() => voiceSettings({}, { video: { tts: { engine: "polly" } } }, {}), /video\.tts\.engine must be one of piper, azure/);
});

test("the cache key changes with the engine and the voice", () => {
  const piper = { engine: "piper", voice: "v", lengthScale: "1" };
  assert.notEqual(sceneKey("a", piper), sceneKey("a", { ...piper, engine: "azure" }));
  assert.notEqual(sceneKey("a", { engine: "azure", voice: "pt-BR-A-Neural", lengthScale: null }), sceneKey("a", { engine: "azure", voice: "pt-BR-B-Neural", lengthScale: null }));
});

test("azure requests: region URL, headers, and escaped SSML in the voice's language", () => {
  const { url, init } = azureRequest(`Notas & "recorrências" <já> d'água`, "pt-BR-Macerio:DragonHDLatestNeural", { region: "brazilsouth", key: KEY });
  assert.equal(url, "https://brazilsouth.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Ocp-Apim-Subscription-Key"], KEY);
  assert.equal(init.headers["Content-Type"], "application/ssml+xml");
  assert.equal(init.headers["X-Microsoft-OutputFormat"], "riff-48khz-16bit-mono-pcm");
  assert.ok(init.headers["User-Agent"]);
  assert.equal(init.body, '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="pt-BR-Macerio:DragonHDLatestNeural">Notas &amp; &quot;recorrências&quot; &lt;já&gt; d&apos;água</voice></speak>');
  assert.equal(escapeXml("a<b"), "a&lt;b");
  assert.throws(() => azureRequest("x", "Francisca", { region: "r", key: KEY }), /no locale prefix/);
});

test("azure synthesis returns the WAV bytes and never puts the key in errors", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 }); };
  const wav = await synthesizeAzure("Olá", "pt-BR-FranciscaNeural", { env: ENV, fetch: ok });
  assert.deepEqual([...wav], [82, 73, 70, 70]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.body, /<voice name="pt-BR-FranciscaNeural">Olá<\/voice>/);
  const denied = async () => new Response(`invalid subscription key ${KEY} ${"x".repeat(500)}`, { status: 401, statusText: "Unauthorized" });
  const error = await synthesizeAzure("Olá", "pt-BR-FranciscaNeural", { env: ENV, fetch: denied }).catch((caught) => caught);
  assert.match(error.message, /^Azure Speech returned 401 Unauthorized for voice pt-BR-FranciscaNeural: invalid subscription key \*\*\*/);
  assert.ok(!error.message.includes(KEY));
  assert.ok(error.message.length < 320);
  const offline = async () => { throw new Error(`connect failed with ${KEY}`); };
  const network = await synthesizeAzure("Olá", "pt-BR-FranciscaNeural", { env: ENV, fetch: offline }).catch((caught) => caught);
  assert.ok(!network.message.includes(KEY));
  await assert.rejects(synthesizeAzure("Olá", "pt-BR-FranciscaNeural", { env: {}, fetch: ok }), /needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION/);
  await assert.rejects(synthesizeAzure("Olá", "pt-BR-FranciscaNeural", { env: { AZURE_SPEECH_KEY: KEY }, fetch: ok }), (caught) => /needs AZURE_SPEECH_REGION/.test(caught.message) && !caught.message.includes(KEY));
  assert.equal(calls.length, 1);
});

test("credits: azure voices get no voice line unless the profile has one; piper is unchanged", () => {
  const voice = "pt-BR-FranciscaNeural";
  assert.equal(credits({ config: AZURE, voice }), "");
  assert.equal(credits({ config: { ...AZURE, video: { ...AZURE.video, music: config.video.music } }, voice, music: "city-sunshine.mp3" }), 'Créditos\nMúsica: "City Sunshine", Kevin MacLeod (FreePD, CC0).');
  assert.equal(credits({ config: { video: { ...AZURE.video, voice_credits: { [voice]: { pt: "Voz: Azure AI Speech." } } } }, voice }), "Créditos\nVoz: Azure AI Speech.");
  assert.throws(() => credits({ config: AZURE }), /pass --voice/);
  assert.throws(() => credits({ config: AZURE, voice: "pt-BR-AntonioNeural" }), /not in video\.tts\.voices/);
  assert.match(credits({ config: { video: { tts: { engine: "piper", voices: ["pt_BR-faber-medium"] } } } }), /Piper TTS/);
  assert.throws(() => credits({ config: { video: { tts: { engine: "piper", voices: ["en_US-other-medium"] } } } }), /no credit text for voice en_US-other-medium/);
});

test("the render output carries the narration engine and voice from voice.json", () => {
  const scenes = [{ id: "a", voiceFile: null }, { id: "b", voiceFile: "job/v/b.wav" }];
  assert.deepEqual(narrationInfo(scenes, { b: { engine: "azure", voice: "pt-BR-FranciscaNeural" } }), { ai_audio: true, ai_audio_engine: "azure", voice: "pt-BR-FranciscaNeural" });
  assert.deepEqual(narrationInfo(scenes, { b: { duration: 1 } }), { ai_audio: true, ai_audio_engine: "piper", voice: null });
  assert.deepEqual(narrationInfo([{ id: "a", voiceFile: null }], {}), { ai_audio: false, ai_audio_engine: null, voice: null });
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

test("without a profile disclaimer, product screens render bare and are reported for a warning", () => {
  const props = { scenes: [{ id: "hook", kind: "hook" }, { id: "tela", kind: "screen" }, { id: "rec", kind: "footage" }, { id: "fake", kind: "footage", synthetic: true }] };
  assert.deepEqual(disclaimerErrors(props, { video: {} }), []);
  assert.deepEqual(undisclaimedScreens(props, { video: {} }), ["tela", "rec"]);
  assert.deepEqual(undisclaimedScreens(props, null), ["tela", "rec"]);
  assert.deepEqual(undisclaimedScreens(props, screenProfile), []);
});

/** Light screenshot (245) with dark text blocks (40) and a full-width divider line, as {width, height, data}. */
function screenshot(width, height, blocks, dividers = []) {
  const data = Buffer.alloc(width * height, 245);
  for (const [x, y, w, h] of blocks) {
    for (let row = y; row < y + h; row += 1) for (let col = x; col < x + w; col += 1) if ((col + row) % 3) data[row * width + col] = 40;
  }
  for (const row of dividers) data.fill(200, row * width, (row + 1) * width);
  return { width, height, data };
}

test("frame edges that slice UI text are refused; flat dividers and full-width boxes pass", () => {
  // A "Período" label at x 1290-1400 on a 1440x1037 screenshot, like the filter the reel cut to "Perí".
  const gray = screenshot(1440, 1037, [[40, 60, 400, 24], [1290, 60, 110, 24], [40, 400, 600, 24]], [300]);
  const cutting = { x: 0, y: 0, w: 1340, h: 965 };
  assert.deepEqual(Object.values(visibleRect(cutting, gray)).map(Math.round), [0, 0, 1340, 965]);
  assert.deepEqual(edgeCuts(gray, visibleRect(cutting, gray)).map((cut) => [cut.edge, cut.at, cut.from, cut.to]), [["right", 1339, 60, 83]]);
  assert.deepEqual(edgeCuts(gray, { x: 0, y: 0, w: 1250, h: 900 }), []);
  assert.deepEqual(edgeCuts(gray, { x: 0, y: 0, w: 1440, h: 1037 }), []);
  assert.deepEqual(edgeCuts(gray, { x: 0, y: 200, w: 1250, h: 400 }), [], "a divider crossing the edge is not content");
  assert.deepEqual(edgeCuts(gray, { x: 0, y: 410, w: 1250, h: 400 }).map((cut) => cut.edge), ["top"]);
  const root = tempDir({ "shot.png": png(1440, 1037) });
  const spec = { id: "v", scenes: [{ id: "tela", kind: "screen", image: "shot.png", focus: { x: 0, y: 0, w: 1340, h: 965 }, pan_to: { x: 0, y: 0, w: 1250, h: 900 } }] };
  assert.deepEqual(specErrors(spec, root, null, { pixels: () => gray }), ["scene tela: focus frame right edge (x=1339) cuts UI content between y=60 and 83; move or resize the box so the edge falls on empty background with a margin, make it span the full screenshot width, or crop the screenshot to the useful area when capturing it"]);
  assert.deepEqual(specErrors(spec, root, null, { pixels: () => null }), []);
  assert.deepEqual(specErrors(spec, root), []);
});

test("frames: first settled and last frame of each screen and footage scene", () => {
  const props = { scenes: [{ id: "hook", kind: "hook", durationInFrames: 72 }, { id: "tela", kind: "screen", durationInFrames: 120 }, { id: "rec", kind: "footage", durationInFrames: 105 }, { id: "cta", kind: "cta", durationInFrames: 183 }] };
  assert.deepEqual(sceneFrames(props), [{ id: "tela", kind: "screen", first: 3, last: 6.333 }, { id: "rec", kind: "footage", first: 7, last: 9.833 }]);
});

test("voice.json is saved after each line, so an Azure failure midway keeps the lines already synthesized", async () => {
  const dir = tempDir({ "p.md": `## Parameters\n\n\`\`\`json\n${JSON.stringify({ video: { tts: { engine: "azure", voices: ["pt-BR-FranciscaNeural"] } } })}\n\`\`\`\n` });
  const spec = join(dir, "spec.json");
  writeFileSync(spec, JSON.stringify({ id: "v", scenes: [{ id: "a", kind: "hook", voice: "Primeira." }, { id: "b", kind: "cta", voice: "Segunda." }] }));
  let calls = 0;
  const fetch = async () => (++calls === 1 ? new Response(new Uint8Array([1]), { status: 200 }) : new Response("Too many requests", { status: 429 }));
  const exec = (command, args) => { if (command === "ffmpeg") writeFileSync(args.at(-1), "wav"); return command === "ffprobe" ? "1.5\n" : ""; };
  const stderr = process.stderr.write;
  process.stderr.write = () => true;
  try {
    await assert.rejects(voiceMain(["--spec", spec, "--profile", join(dir, "p.md"), "--work", join(dir, "work")], { env: ENV, fetch, exec }), /Azure Speech returned 429/);
  } finally {
    process.stderr.write = stderr;
  }
  const saved = JSON.parse(readFileSync(join(dir, "work", "voice", "v", "voice.json"), "utf8"));
  assert.deepEqual(Object.keys(saved), ["a"]);
  assert.equal(saved.a.engine, "azure");
  assert.equal(saved.a.voice, "pt-BR-FranciscaNeural");
  assert.ok(existsSync(join(dir, "work", "voice", "v", "a.wav")));
});

test("music volume: defaults stay 0.18 and 0.07; the profile and then the spec override them", () => {
  assert.deepEqual(DEFAULT_MUSIC_VOLUME, { bed: 0.18, ducked: 0.07 });
  assert.deepEqual(musicVolume({}, null), { volume: { bed: 0.18, ducked: 0.07 }, errors: [] });
  const profile = { video: { music: { bed_volume: 0.25, ducked_volume: 0.1 } } };
  assert.deepEqual(musicVolume({}, profile).volume, { bed: 0.25, ducked: 0.1 });
  assert.deepEqual(musicVolume({ music_volume: { ducked: 0.05 } }, profile).volume, { bed: 0.25, ducked: 0.05 });
  assert.deepEqual(musicVolume({ music_volume: { bed: 1, ducked: 1 } }, null), { volume: { bed: 1, ducked: 1 }, errors: [] });
});

test("music volume: out of (0, 1], not a number, or ducked louder than the bed is refused with the key", () => {
  assert.deepEqual(musicVolume({}, { video: { music: { bed_volume: 0 } } }).errors, ["video.music.bed_volume must be a number greater than 0 and at most 1 (got 0)"]);
  assert.deepEqual(musicVolume({ music_volume: { ducked: 1.5 } }, null).errors, ["music_volume.ducked must be a number greater than 0 and at most 1 (got 1.5)"]);
  assert.deepEqual(musicVolume({}, { video: { music: { ducked_volume: "0.1" } } }).errors, ['video.music.ducked_volume must be a number greater than 0 and at most 1 (got "0.1")']);
  assert.deepEqual(musicVolume({}, { video: { music: { ducked_volume: 0.3 } } }).errors, ["video.music.ducked_volume (0.3) must not be louder than the default bed volume (0.18): the music ducks under the voice"]);
  assert.deepEqual(musicVolume({ music_volume: 0.2 }, null).errors, ["music_volume must be an object {bed, ducked}"]);
  assert.deepEqual(specErrors({ id: "v", scenes: [{ id: "a", kind: "hook" }], music_volume: { bed: 0.1, ducked: 0.2 } }, tempDir({})), ["music_volume.ducked (0.2) must not be louder than music_volume.bed (0.1): the music ducks under the voice"]);
});

test("buildProps passes the music volume to the Remotion props and refuses an invalid one", () => {
  const root = tempDir({});
  const spec = { id: "v", scenes: [{ id: "hook", kind: "hook", title: "Oi" }] };
  const base = { root, jobPublic: "job/v", voice: {}, music: null };
  assert.deepEqual(buildProps(spec, { ...base, config: null, jobDir: join(root, "a") }).musicVolume, { bed: 0.18, ducked: 0.07 });
  assert.deepEqual(buildProps({ ...spec, music_volume: { bed: 0.3 } }, { ...base, config: { video: { music: { ducked_volume: 0.12 } } }, jobDir: join(root, "b") }).musicVolume, { bed: 0.3, ducked: 0.12 });
  assert.throws(() => buildProps({ ...spec, music_volume: { bed: 2 } }, { ...base, config: null, jobDir: join(root, "c") }), /invalid music volume/);
});

test("the studio reads the music volume from props, with the old levels as Root defaults", () => {
  const studio = ".rulesync/skills/video-shorts/assets/studio/src";
  const short = readFileSync(`${studio}/Short.tsx`, "utf8");
  assert.ok(!/BED_VOLUME|DUCKED_VOLUME/.test(short));
  assert.match(short, /\[volume\.ducked, volume\.bed\]/);
  assert.match(readFileSync(`${studio}/schema.ts`, "utf8"), /musicVolume: z\.object\(\{ bed: z\.number\(\)\.gt\(0\)\.lte\(1\), ducked: z\.number\(\)\.gt\(0\)\.lte\(1\) \}\)/);
  assert.match(readFileSync(`${studio}/Root.tsx`, "utf8"), /musicVolume: \{ bed: 0\.18, ducked: 0\.07 \}/);
});

test("voice.mjs logs one azure-speech ledger line per synthesized line, nothing for unchanged lines or Piper", async () => {
  const { readUsage } = await import("../../.rulesync/skills/video-shorts/scripts/social-manifest.mjs");
  const profile = (tts) => `## Parameters\n\n\`\`\`json\n${JSON.stringify({ video: { tts } })}\n\`\`\`\n`;
  const dir = tempDir({ "azure.md": profile({ engine: "azure", voices: ["pt-BR-FranciscaNeural"] }), "piper.md": profile({ engine: "piper", voices: ["pt_BR-faber-medium"] }), "models/pt_BR-faber-medium.onnx": "m", "models/pt_BR-faber-medium.onnx.json": "{}" });
  const spec = join(dir, "spec.json");
  writeFileSync(spec, JSON.stringify({ id: "v", scenes: [{ id: "a", kind: "hook", voice: "Olá & até já", say: "Olá & até já!" }, { id: "b", kind: "cta", voice: "Teste <grátis>." }, { id: "c", kind: "screen", image: "x.png" }] }));
  const fetch = async () => new Response(new Uint8Array([1]), { status: 200 });
  const exec = (command, args) => { if (command === "ffmpeg") writeFileSync(args.at(-1), "wav"); return command === "ffprobe" ? "1.5\n" : ""; };
  const usage = join(dir, "batch", "usage.jsonl");
  const run = (args) => voiceMain(["--spec", spec, "--work", join(dir, "work"), "--usage", usage, ...args], { env: ENV, fetch, exec, now: () => new Date("2026-11-28T07:47:00Z") });
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    await run(["--profile", join(dir, "azure.md"), "--item", "2026-12-03-v", "--revision", "2"]);
    await run(["--profile", join(dir, "azure.md")]);
    writeFileSync(spec, JSON.stringify({ id: "p", scenes: [{ id: "a", kind: "hook", voice: "Piper é local." }] }));
    await voiceMain(["--spec", spec, "--profile", join(dir, "piper.md"), "--work", join(dir, "work"), "--usage", usage], { env: { PIPER_MODEL_DIR: join(dir, "models") }, exec });
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
  const entries = readUsage(usage);
  assert.deepEqual(entries.map(({ id, ...rest }) => rest), [
    { at: "2026-11-28T07:47:00.000Z", service: "azure-speech", unit: "characters", quantity: 17, voice: "pt-BR-FranciscaNeural", spec: "v", scene: "a", item: "2026-12-03-v", revision: 2 },
    { at: "2026-11-28T07:47:00.000Z", service: "azure-speech", unit: "characters", quantity: 21, voice: "pt-BR-FranciscaNeural", spec: "v", scene: "b", item: "2026-12-03-v", revision: 2 },
  ]);
  assert.ok(entries.every((entry) => typeof entry.id === "string" && entry.id.length > 8));
  await assert.rejects(voiceMain(["--spec", spec, "--usage", usage, "--revision", "0"]), /--revision must be an integer >= 1/);
});
