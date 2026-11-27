#!/usr/bin/env node
// Credits text for a video description: the Piper voice's license chain and the music track.
// Usage: credits.mjs [--profile <profile.md>] [--voice <id>] [--music <file or title>] [--lang pt-BR|en]
// Voices other than the built-in ones need their credit in the profile (video.voice_credits[<voice>][<lang>]).
import { basename } from "node:path";
import { isMain, readProfileConfig } from "./social-manifest.mjs";

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
  if (!track) throw new CreditsError(`music ${music} is not listed in video.music.tracks of the profile; add its title, author, source and license`);
  return track;
}

export function credits({ config = null, voice = null, music = null, lang = null } = {}) {
  const language = langOf(lang ?? config?.language);
  const voiceId = voice ?? config?.video?.voice ?? DEFAULT_VOICE;
  const voiceText = config?.video?.voice_credits?.[voiceId]?.[language] ?? VOICE_CREDITS[voiceId]?.[language];
  if (voice !== false && !voiceText) throw new CreditsError(`no credit text for voice ${voiceId} in ${language}; add video.voice_credits.${voiceId}.${language} to the profile`);
  const lines = [HEADINGS[language].title];
  if (voice !== false) lines.push(voiceText);
  const musicLine = musicCredit(findTrack(config, music), language);
  if (musicLine) lines.push(musicLine);
  return lines.join("\n");
}

export function main(argv, { out = process.stdout } = {}) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  try {
    const config = value("profile") ? readProfileConfig(value("profile")) : null;
    out.write(`${credits({ config, voice: argv.includes("--no-voice") ? false : value("voice") ?? null, music: value("music") ?? null, lang: value("lang") ?? null })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
