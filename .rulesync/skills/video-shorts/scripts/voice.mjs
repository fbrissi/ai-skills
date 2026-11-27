#!/usr/bin/env node
// Narration with Piper TTS: one WAV per scene with a voice line, silence trimmed, light EQ and loudness
// normalized to -16 LUFS (48 kHz stereo). Skips scenes whose text, voice and speed did not change.
// Usage: voice.mjs --spec <video.json> [--profile <profile.md>] [--work .cache/video-shorts]
// Env: PIPER_PYTHON (python with piper-tts, default python3), PIPER_MODEL_DIR (default <work>/models),
//      PIPER_LENGTH_SCALE (default from the spec or profile, else 0.92).
// Writes <work>/voice/<video id>/<scene>.wav and voice.json ({scene: {duration, text, key}}).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain, readProfileConfig } from "./social-manifest.mjs";

export const VOICE_FILTER = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=70,equalizer=f=180:t=q:w=1:g=2,loudnorm=I=-16:TP=-1.5:LRA=7";

export function voiceSettings(spec, config, env = process.env) {
  return {
    voice: spec.voice ?? config?.video?.voice ?? "pt_BR-faber-medium",
    lengthScale: String(env.PIPER_LENGTH_SCALE ?? spec.length_scale ?? config?.video?.length_scale ?? 0.92),
  };
}

export function sceneKey(text, settings) {
  return createHash("sha256").update(JSON.stringify([text, settings.voice, settings.lengthScale])).digest("hex").slice(0, 16);
}

function ensureModel(python, modelDir, voice) {
  const model = join(modelDir, `${voice}.onnx`);
  if (existsSync(model) && existsSync(`${model}.json`)) return model;
  mkdirSync(modelDir, { recursive: true });
  execFileSync(python, ["-m", "piper.download_voices", "--download-dir", modelDir, voice], { stdio: ["ignore", "inherit", "inherit"] });
  if (!existsSync(model)) throw new Error(`Piper voice ${voice} was not downloaded to ${modelDir}`);
  return model;
}

export function main(argv, { env = process.env } = {}) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("spec")) throw new Error("usage: voice.mjs --spec <video.json> [--profile <md>] [--work <dir>]");
  const spec = JSON.parse(readFileSync(value("spec"), "utf8"));
  const config = value("profile") ? readProfileConfig(value("profile")) : null;
  const work = resolve(value("work") ?? ".cache/video-shorts");
  const settings = voiceSettings(spec, config, env);
  const python = env.PIPER_PYTHON ?? "python3";
  const model = ensureModel(python, resolve(env.PIPER_MODEL_DIR ?? join(work, "models")), settings.voice);
  const dir = join(work, "voice", spec.id);
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, "voice.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  for (const scene of spec.scenes) {
    if (!scene.voice) { delete manifest[scene.id]; continue; }
    const spoken = scene.say ?? scene.voice;
    const key = sceneKey(spoken, settings);
    const output = join(dir, `${scene.id}.wav`);
    if (manifest[scene.id]?.key === key && existsSync(output)) { process.stderr.write(`voice ${scene.id}: unchanged\n`); continue; }
    const raw = join(dir, `${scene.id}.raw.wav`);
    execFileSync(python, ["-I", "-m", "piper", "-m", model, "--length-scale", settings.lengthScale, "--sentence-silence", "0.18", "-f", raw], { input: spoken, stdio: ["pipe", "ignore", "inherit"] });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", VOICE_FILTER, "-ar", "48000", "-ac", "2", output]);
    rmSync(raw, { force: true });
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }).trim());
    manifest[scene.id] = { duration, text: scene.voice, key };
    process.stderr.write(`voice ${scene.id}: ${duration.toFixed(2)} s\n`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ voice: settings.voice, dir, scenes: manifest }, null, 2)}\n`);
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
