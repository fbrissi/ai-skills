#!/usr/bin/env node
// Credits text for a video description: the Piper voice's license chain and the music track.
// Usage: credits.mjs [--profile <profile.md>] [--voice <id>] [--music <file or title>] [--lang pt-BR|en]
// Piper voices other than the built-in ones need their credit in the profile (video.voice_credits[<voice>][<lang>]).
// Azure AI Speech voices (video.tts.engine azure) get a credit line only when the profile has one for the voice.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isMain, readProfileConfig, ttsConfig } from "./social-manifest.mjs";

export const DEFAULT_VOICE = "pt_BR-faber-medium";

export const VOICE_CREDITS = {
  "pt_BR-faber-medium": {
    pt: 'Locução: voz sintética gerada com Piper TTS (OHF-Voice, projeto sucessor de rhasspy/piper; software GPL-3.0), voz pt_BR "faber" (medium). Dataset da voz: CC0 (https://github.com/OHF-Voice/voice-datasets). O modelo foi ajustado (fine-tuning) a partir do modelo base hifi_tts_92, treinado com o "Hi-Fi Multi-Speaker English TTS Dataset" (NVIDIA Corporation; leitora 92, Cori Samuel; áudio-fonte LibriVox), licenciado sob CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) e disponível em https://www.openslr.org/109/. Alterações: o modelo foi ajustado para português pelo autor da voz; o áudio gerado foi editado (corte de silêncio, equalização e normalização).',
    en: 'Voice-over: synthetic voice generated with Piper TTS (OHF-Voice, successor of rhasspy/piper; GPL-3.0 software), pt_BR voice "faber" (medium). Voice dataset: CC0 (https://github.com/OHF-Voice/voice-datasets). The model was fine-tuned from the hifi_tts_92 base model, trained on the "Hi-Fi Multi-Speaker English TTS Dataset" (NVIDIA Corporation; reader 92, Cori Samuel; LibriVox source audio), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) and available at https://www.openslr.org/109/. Changes: the voice author fine-tuned the model for Portuguese; the generated audio was edited (silence trimming, equalization and normalization).',
  },
};

const HEADINGS = { pt: { title: "Créditos", music: "Música" }, en: { title: "Credits", music: "Music" } };

export class CreditsError extends Error {}

const langOf = (lang) => (String(lang ?? "pt-BR").toLowerCase().startsWith("pt") ? "pt" : "en");

export function musicCredit(track, lang) {
  if (!track) return null;
  if (track.credit) return track.credit;
  const license = [track.source, track.license].filter(Boolean).join(", ");
  return `${HEADINGS[lang].music}: "${track.title}", ${track.author}${license ? ` (${license})` : ""}.`;
}

export function findTrack(config, music) {
  if (!music) return null;
  const tracks = config?.video?.music?.tracks ?? [];
  const name = basename(music).toLowerCase();
  const track = tracks.find((entry) => [entry.file, entry.title].filter(Boolean).some((value) => value.toLowerCase() === name || basename(value).toLowerCase() === name));
  if (!track) throw new CreditsError(`music ${music} is not listed in video.music.tracks of the profile; add its title, author, source, license, license_url, evidence and sha256`);
  const missing = MUSIC_EVIDENCE.filter((key) => !track[key]);
  if (missing.length) throw new CreditsError(`music ${track.title ?? music} needs ${missing.join(", ")} in video.music.tracks: the license URL, the Drive file id of the license evidence, and the file's SHA-256`);
  if (!/^[0-9a-f]{64}$/.test(track.sha256)) throw new CreditsError(`music ${track.title}: sha256 must be 64 lowercase hex characters`);
  return track;
}

export const MUSIC_EVIDENCE = ["title", "license", "license_url", "evidence", "sha256"];

/** SHA-256 of a local file, to prove the track used is the one whose license evidence is on file. */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The manifest's music entry for a track, after checking the local file against the recorded hash. */
export function musicEntry(config, musicPath) {
  const track = findTrack(config, musicPath);
  if (!track) return null;
  const actual = sha256File(musicPath);
  if (actual !== track.sha256) throw new CreditsError(`music ${basename(musicPath)} does not match the sha256 in the profile (got ${actual}); download the licensed file again`);
  const { file = basename(musicPath), title, author = null, source = null, license, license_url, evidence, sha256 } = track;
  return { file, title, author, source, license, license_url, evidence, sha256 };
}

export function credits({ config = null, voice = null, music = null, lang = null } = {}) {
  const language = langOf(lang ?? config?.language);
  const { engine, voices } = ttsConfig(config);
  if (voice == null && voices?.length > 1) throw new CreditsError(`the profile lists several voices in video.tts.voices; pass --voice with the voice the video used`);
  if (voice && voices && !voices.includes(voice)) throw new CreditsError(`voice ${voice} is not in video.tts.voices of the profile (${voices.join(", ")})`);
  const voiceId = voice || (voices?.length === 1 ? voices[0] : null) || config?.video?.voice || (engine === "piper" ? DEFAULT_VOICE : null);
  const profileText = voiceId ? config?.video?.voice_credits?.[voiceId]?.[language] : null;
  // Azure prebuilt voices are a paid service that needs no attribution; Piper voices carry their license chain.
  const voiceText = engine === "azure" ? profileText ?? null : profileText ?? VOICE_CREDITS[voiceId]?.[language];
  if (voice !== false && engine === "piper" && !voiceText) throw new CreditsError(`no credit text for voice ${voiceId} in ${language}; add video.voice_credits.${voiceId}.${language} to the profile`);
  const lines = [HEADINGS[language].title];
  if (voice !== false && voiceText) lines.push(voiceText);
  const musicLine = musicCredit(findTrack(config, music), language);
  if (musicLine) lines.push(musicLine);
  return lines.length > 1 ? lines.join("\n") : "";
}

export function main(argv, { out = process.stdout } = {}) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  try {
    const config = value("profile") ? readProfileConfig(value("profile")) : null;
    const text = credits({ config, voice: argv.includes("--no-voice") ? false : value("voice") ?? null, music: value("music") ?? null, lang: value("lang") ?? null });
    if (text) out.write(`${text}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
