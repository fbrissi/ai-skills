#!/usr/bin/env node
// Narration with Piper TTS (default) or Azure AI Speech: one WAV per scene with a voice line, silence trimmed, light
// EQ and loudness normalized to -16 LUFS (48 kHz stereo). Skips scenes whose text, engine, voice and speed did not change.
// Usage: voice.mjs --spec <video.json> [--profile <profile.md>] [--work .cache/video-shorts]
// Engine and voices: video.tts ({engine, voices, rotation}) in the profile; without it Piper with video.voice.
// Env (Piper): PIPER_PYTHON (python with piper-tts, default python3), PIPER_MODEL_DIR (default <work>/models),
//      PIPER_LENGTH_SCALE (default from the spec or profile, else 0.92).
// Env (Azure): AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
// Writes <work>/voice/<video id>/<scene>.wav and voice.json ({scene: {duration, text, key, engine, voice}}).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain, readProfileConfig, ttsConfig } from "./social-manifest.mjs";

export const VOICE_FILTER = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=70,equalizer=f=180:t=q:w=1:g=2,loudnorm=I=-16:TP=-1.5:LRA=7";

export const DEFAULT_PIPER_VOICE = "pt_BR-faber-medium";
export const AZURE_OUTPUT_FORMAT = "riff-48khz-16bit-mono-pcm";
const USER_AGENT = "ai-skills-video-shorts";

export class VoiceError extends Error {}

function pickVoice(spec, config, engine, voices) {
  if (voices) {
    if (spec.voice) {
      if (!voices.includes(spec.voice)) throw new VoiceError(`voice ${spec.voice} is not in video.tts.voices of the profile (${voices.join(", ")})`);
      return spec.voice;
    }
    if (voices.length > 1) throw new VoiceError(`the profile lists several voices in video.tts.voices (${voices.join(", ")}); set "voice" in the spec${spec.id ? ` ${spec.id}` : ""} to the voice its manifest item was assigned`);
    return voices[0];
  }
  const voice = spec.voice ?? config?.video?.voice ?? (engine === "piper" ? DEFAULT_PIPER_VOICE : null);
  if (!voice) throw new VoiceError(`video.tts.engine ${engine} needs a voice: list it in video.tts.voices or set "voice" in the spec`);
  return voice;
}

export function voiceSettings(spec, config, env = process.env) {
  const { engine, voices } = ttsConfig(config);
  const voice = pickVoice(spec, config, engine, voices);
  if (engine === "azure") return { engine, voice, lengthScale: null };
  return { engine, voice, lengthScale: String(env.PIPER_LENGTH_SCALE ?? spec.length_scale ?? config?.video?.length_scale ?? 0.92) };
}

export function sceneKey(text, settings) {
  return createHash("sha256").update(JSON.stringify([text, settings.engine ?? "piper", settings.voice, settings.lengthScale])).digest("hex").slice(0, 16);
}

export function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

/** The xml:lang of an Azure voice id, from its locale prefix (pt-BR-FranciscaNeural -> pt-BR). */
export function azureLanguage(voice) {
  const match = /^([a-z]{2,3}-[A-Z]{2,4})-/.exec(voice);
  if (!match) throw new VoiceError(`Azure voice ${voice} has no locale prefix (for example pt-BR-FranciscaNeural)`);
  return match[1];
}

/** The REST request that synthesizes one line with Azure AI Speech. */
export function azureRequest(text, voice, { region, key }) {
  const lang = azureLanguage(voice);
  return {
    url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    init: {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
        "User-Agent": USER_AGENT,
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`,
    },
  };
}

export function azureCredentials(env = process.env) {
  const key = env.AZURE_SPEECH_KEY;
  const region = env.AZURE_SPEECH_REGION;
  const missing = [key ? null : "AZURE_SPEECH_KEY", region ? null : "AZURE_SPEECH_REGION"].filter(Boolean);
  if (missing.length) throw new VoiceError(`video.tts.engine azure needs ${missing.join(" and ")} in the environment`);
  if (!/^[a-z0-9-]+$/i.test(region)) throw new VoiceError("AZURE_SPEECH_REGION must be a region name such as brazilsouth");
  return { key, region };
}

const redact = (text, key) => String(text).split(key).join("***");

/** Synthesizes one line with Azure AI Speech and returns the WAV bytes. The key never appears in errors. */
export async function synthesizeAzure(text, voice, { env = process.env, fetch = globalThis.fetch } = {}) {
  const credentials = azureCredentials(env);
  const { url, init } = azureRequest(text, voice, credentials);
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new VoiceError(`Azure Speech request to ${credentials.region} failed: ${redact(error?.message ?? error, credentials.key)}`);
  }
  if (response.status !== 200) {
    const body = await response.text().catch(() => "");
    const excerpt = redact(body, credentials.key).replace(/\s+/g, " ").trim().slice(0, 200);
    throw new VoiceError(`Azure Speech returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""} for voice ${voice}${excerpt ? `: ${excerpt}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function ensureModel(python, modelDir, voice) {
  const model = join(modelDir, `${voice}.onnx`);
  if (existsSync(model) && existsSync(`${model}.json`)) return model;
  mkdirSync(modelDir, { recursive: true });
  execFileSync(python, ["-m", "piper.download_voices", "--download-dir", modelDir, voice], { stdio: ["ignore", "inherit", "inherit"] });
  if (!existsSync(model)) throw new Error(`Piper voice ${voice} was not downloaded to ${modelDir}`);
  return model;
}

export async function main(argv, { env = process.env, fetch = globalThis.fetch, exec = execFileSync } = {}) {
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
  if (settings.engine === "azure") azureCredentials(env);
  const model = settings.engine === "piper" ? ensureModel(python, resolve(env.PIPER_MODEL_DIR ?? join(work, "models")), settings.voice) : null;
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
    if (settings.engine === "azure") writeFileSync(raw, await synthesizeAzure(spoken, settings.voice, { env, fetch }));
    else exec(python, ["-I", "-m", "piper", "-m", model, "--length-scale", settings.lengthScale, "--sentence-silence", "0.18", "-f", raw], { input: spoken, stdio: ["pipe", "ignore", "inherit"] });
    exec("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", VOICE_FILTER, "-ar", "48000", "-ac", "2", output]);
    rmSync(raw, { force: true });
    const duration = Number(exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }).trim());
    manifest[scene.id] = { duration, text: scene.voice, key, engine: settings.engine, voice: settings.voice };
    // Saved after every line so a failure later (an Azure 429, the network) keeps the lines already synthesized.
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stderr.write(`voice ${scene.id}: ${duration.toFixed(2)} s\n`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ engine: settings.engine, voice: settings.voice, dir, scenes: manifest }, null, 2)}\n`);
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
