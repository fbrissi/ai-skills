#!/usr/bin/env node
// Social content batch manifest: load, validate (JSON Schema + platform rules), compose post text,
// approve, probe media, and read the profile's Parameters block. No dependencies; Node 22+.
// Usage:
//   social-manifest.mjs validate <manifest.json> [--profile <profile.md>] [--no-files] [--for-publish] [--now ISO]
//   social-manifest.mjs probe <manifest.json>
//   social-manifest.mjs approve <manifest.json> --by <login> [--at ISO]
//   social-manifest.mjs text <manifest.json> [--item <id>]
//   social-manifest.mjs config <profile.md> [--platform <name>] [--key <dotted.path>]
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = resolve(here, "../references/social-manifest.schema.json");

export const PLATFORM_TYPES = {
  facebook: ["post", "photo", "carousel", "reel"],
  instagram: ["photo", "carousel", "reel", "story"],
  youtube: ["short", "video"],
  linkedin: ["post", "photo", "carousel", "video"],
};

/** Platforms without a scheduling API: a cron runs the publisher and publish_at is null. */
export const UNSCHEDULED_PLATFORMS = ["instagram", "linkedin"];

export const LIMITS = {
  facebook: { minLeadSeconds: 10 * 60, maxLeadSeconds: 30 * 24 * 3600, reelMaxLeadSeconds: 29 * 24 * 3600, messageLength: 63206, reelMin: 3, reelMax: 90, reelsPerDay: 30, carouselMax: 10 },
  instagram: { captionLength: 2200, hashtags: 5, mentions: 20, carouselMin: 2, carouselMax: 20, reelMin: 3, reelMax: 900, storyVideoMax: 60, ratioMin: 4 / 5, ratioMax: 1.91 },
  youtube: { titleLength: 100, descriptionBytes: 5000, tagsLength: 500, shortMax: 180, musicShortMax: 60, minLeadSeconds: 15 * 60 },
  linkedin: { commentaryLength: 3000, carouselMin: 2, carouselMax: 20, videoMin: 3, videoMax: 30 * 60 },
};

/** LinkedIn has no AI flag in its API: a plain-text disclosure goes in the post when AI audio or footage is used. */
export const AI_DISCLOSURE = {
  pt: { audio: "Narração com voz sintética (Piper TTS).", visual: "Contém imagens geradas por IA." },
  en: { audio: "Narrated with a synthetic voice (Piper TTS).", visual: "Contains AI-generated footage." },
};

/** Narration disclosure per TTS engine (item.ai_audio_engine; items without it were narrated with Piper). */
export const AI_AUDIO_DISCLOSURE = {
  piper: { pt: AI_DISCLOSURE.pt.audio, en: AI_DISCLOSURE.en.audio },
  azure: { pt: "Narração com voz sintética (Azure AI Speech).", en: "Narrated with a synthetic voice (Azure AI Speech)." },
};

export function aiDisclosure(item, language = "pt-BR") {
  if (!item.ai_audio && !item.synthetic_media) return null;
  if (item.options?.ai_disclosure) return item.options.ai_disclosure;
  const lang = String(language).toLowerCase().startsWith("pt") ? "pt" : "en";
  const audio = (AI_AUDIO_DISCLOSURE[item.ai_audio_engine] ?? AI_AUDIO_DISCLOSURE.piper)[lang];
  return [item.ai_audio ? audio : null, item.synthetic_media ? AI_DISCLOSURE[lang].visual : null].filter(Boolean).join(" ");
}

// ---------- narration voices ----------

export const TTS_ENGINES = ["piper", "azure"];
export const TTS_ROTATIONS = ["alternate"];

/** The profile's TTS settings: video.tts when set, else Piper with video.voice (no voice list). */
export function ttsConfig(config) {
  const tts = config?.video?.tts;
  if (!tts) return { engine: "piper", voices: null, rotation: null };
  const engine = tts.engine ?? "piper";
  if (!TTS_ENGINES.includes(engine)) throw new ManifestError(`video.tts.engine must be one of ${TTS_ENGINES.join(", ")} (got ${engine})`);
  if (tts.rotation != null && !TTS_ROTATIONS.includes(tts.rotation)) throw new ManifestError(`video.tts.rotation must be ${TTS_ROTATIONS.join(" or ")} or omitted (got ${tts.rotation})`);
  if (tts.voices !== undefined && (!Array.isArray(tts.voices) || tts.voices.some((voice) => typeof voice !== "string" || !voice))) throw new ManifestError("video.tts.voices must be a list of voice ids");
  if (tts.voices?.length > 1 && tts.rotation !== "alternate") throw new ManifestError("video.tts.voices lists several voices, so video.tts.rotation must be \"alternate\"; list one voice to always use it");
  return { engine, voices: tts.voices?.length ? [...tts.voices] : null, rotation: tts.rotation ?? null };
}

/** The voice after previousVoice in the list; the first voice when there is no previous one or it left the list. */
export function nextVoice(voices, previousVoice = null) {
  if (!voices?.length) return null;
  const index = voices.indexOf(previousVoice);
  return voices[index < 0 ? 0 : (index + 1) % voices.length];
}

/** Assigns voices in order (items already in publish order), continuing the rotation after previousVoice. */
export function assignVoices(items, voices, previousVoice = null) {
  let voice = previousVoice;
  return items.map((item) => {
    voice = nextVoice(voices, voice);
    return { ...item, voice };
  });
}

/** The voice of a batch's last narrated item in publish order (publish_at, then date, then list order). */
export function lastVoice(manifest) {
  const voiced = (manifest?.items ?? []).map((item, index) => ({ item, index })).filter(({ item }) => item.voice);
  const when = ({ item }) => item.publish_at ? Date.parse(item.publish_at) : Date.parse(`${item.date}T00:00:00Z`) || 0;
  voiced.sort((a, b) => when(a) - when(b) || a.index - b.index);
  return voiced.at(-1)?.item.voice ?? null;
}

/** Meta's AI label (is_ai_generated) applies to realistic AI visuals and to AI-generated narration. */
export function isAiGenerated(item) {
  return Boolean(item.synthetic_media || item.ai_audio);
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const VIDEO_EXT = new Set([".mp4", ".mov"]);

export class ManifestError extends Error {}

export function loadManifest(path) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ManifestError(`${path}: invalid JSON (${error.message})`);
  }
  return data;
}

export function saveManifest(path, manifest) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(tmp, path);
}

// ---------- minimal JSON Schema (2020-12 subset used by the manifest schema) ----------

const FORMATS = {
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
  "date-time": (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)),
  "date-time-offset": (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
};

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

export function schemaErrors(value, schema, root = schema, path = "$") {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((node, key) => node[key], root);
    return schemaErrors(value, target, root, path);
  }
  const errors = [];
  if ("const" in schema && value !== schema.const) return [`${path}: must be ${JSON.stringify(schema.const)}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: must be one of ${schema.enum.join(", ")}`];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) return [`${path}: must be ${types.join(" or ")}`];
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](value)) errors.push(`${path}: not a valid ${schema.format}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: allows at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((entry, index) => errors.push(...schemaErrors(entry, schema.items, root, `${path}[${index}]`)));
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, entry] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(entry, schema.properties[key], root, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown property ${key}`);
      else if (typeof schema.additionalProperties === "object") errors.push(...schemaErrors(entry, schema.additionalProperties, root, `${path}.${key}`));
    }
  }
  return errors;
}

let cachedSchema;
export function manifestSchema() {
  cachedSchema ??= JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  return cachedSchema;
}

// ---------- text composition ----------

/**
 * The exact text a publisher sends: body, link (when not already in it), the LinkedIn AI disclosure, credits, then
 * hashtags.
 */
export function composeText(item, platform, language = "pt-BR") {
  const body = (platform === "youtube" ? item.description : item.caption) ?? "";
  const parts = [body.trim()];
  const includesLink = item.link && body.includes(item.link);
  const linkSentApart = (platform === "facebook" || platform === "linkedin") && item.type === "post";
  if (item.link && !includesLink && !linkSentApart && platform !== "instagram") parts.push(item.link);
  const disclosure = platform === "linkedin" ? aiDisclosure(item, language) : null;
  if (disclosure && !body.includes(disclosure)) parts.push(disclosure);
  if (item.credits && !body.includes(item.credits.trim())) parts.push(item.credits.trim());
  const tags = (item.hashtags ?? []).filter((tag) => !new RegExp(`(^|\\s)${escapeRegExp(tag)}(?![\\p{L}\\p{N}_])`, "u").test(body));
  if (tags.length) parts.push(tags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- media ----------

/** Width and height of a PNG or JPEG from its header, or null. */
export function imageSize(path) {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(64 * 1024);
    const length = readSync(fd, head, 0, head.length, 0);
    const buf = head.subarray(0, length);
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) { offset += 1; continue; }
        const marker = buf[offset + 1];
        const size = buf.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5), format: "jpeg" };
        }
        offset += 2 + size;
      }
      return { width: null, height: null, format: "jpeg" };
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

/** Width, height and duration of a video with ffprobe, or null when ffprobe is missing. */
export function videoInfo(path) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path], { encoding: "utf8" });
    const data = JSON.parse(out);
    const stream = data.streams?.[0] ?? {};
    return { width: stream.width, height: stream.height, duration: Number(data.format?.duration) };
  } catch {
    return null;
  }
}

export function resolveMediaPath(manifestDir, path) {
  const full = resolve(manifestDir, path);
  const rel = relative(manifestDir, full);
  if (isAbsolute(path) || rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

export function probeManifest(manifest, manifestDir) {
  for (const item of manifest.items) {
    for (const media of item.media ?? []) {
      const full = resolveMediaPath(manifestDir, media.path);
      if (!full || !existsSync(full)) continue;
      const info = media.kind === "image" ? imageSize(full) : videoInfo(full);
      if (!info) continue;
      if (info.width) media.width = info.width;
      if (info.height) media.height = info.height;
      if (info.duration) media.duration = Math.round(info.duration * 100) / 100;
    }
  }
  return manifest;
}

// ---------- platform rules ----------

const ratio = (media) => (media.width && media.height ? media.width / media.height : null);
const isVertical916 = (media) => ratio(media) !== null && Math.abs(ratio(media) - 9 / 16) < 0.01;

function itemRuleErrors(item, platform, { manifestDir, checkFiles, now, forPublish, language }) {
  const errors = [];
  const add = (message) => errors.push(`${item.id}: ${message}`);
  if (!PLATFORM_TYPES[platform].includes(item.type)) add(`type ${item.type} is not supported on ${platform} (${PLATFORM_TYPES[platform].join(", ")})`);
  const images = item.media.filter((m) => m.kind === "image");
  const videos = item.media.filter((m) => m.kind === "video");

  for (const media of [...item.media, ...(item.thumbnail ? [{ path: item.thumbnail, kind: "image" }] : []), ...(item.options?.captions ? [{ path: item.options.captions, kind: "file" }] : []), ...(item.spec ? [{ path: item.spec, kind: "file" }] : [])]) {
    const full = resolveMediaPath(manifestDir, media.path);
    const ext = extname(media.path).toLowerCase();
    if (!full) { add(`media path must stay inside the batch directory: ${media.path}`); continue; }
    if (media.kind === "image" && !IMAGE_EXT.has(ext)) add(`image must be JPEG or PNG: ${media.path}`);
    if (media.kind === "video" && !VIDEO_EXT.has(ext)) add(`video must be MP4 or MOV: ${media.path}`);
    if (checkFiles && (!existsSync(full) || !statSync(full).isFile())) add(`file not found: ${media.path}`);
  }

  if (item.publish_at !== null && item.publish_at !== undefined && !FORMATS["date-time-offset"](item.publish_at)) add("publish_at needs date, time and offset, for example 2026-12-01T12:30:00-03:00");
  if (item.scheduled && !item.publish_at) add("scheduled items need publish_at");
  if (item.publish_at && !item.publish_at.startsWith(item.date) && FORMATS["date-time-offset"](item.publish_at)) add(`publish_at ${item.publish_at} is not on date ${item.date}`);
  const lead = item.publish_at ? (Date.parse(item.publish_at) - now.getTime()) / 1000 : null;

  if (platform === "facebook") {
    const text = composeText(item, platform);
    if (!text.trim()) add("caption is empty");
    if (text.length > LIMITS.facebook.messageLength) add(`caption longer than ${LIMITS.facebook.messageLength} characters`);
    if (item.visibility !== "public") add("Facebook Page posts are public; set visibility public");
    const maxLead = item.type === "reel" ? LIMITS.facebook.reelMaxLeadSeconds : LIMITS.facebook.maxLeadSeconds;
    if (item.scheduled && forPublish && lead !== null && (lead < LIMITS.facebook.minLeadSeconds || lead > maxLead)) {
      add(`publish_at must be between 10 minutes and ${maxLead / 86400} days from now`);
    }
    if (item.type === "post" && item.media.length) add("type post has no media (use photo or carousel)");
    if (item.type === "photo" && (images.length !== 1 || videos.length)) add("type photo needs exactly one image");
    if (item.type === "carousel" && (images.length < 2 || images.length > LIMITS.facebook.carouselMax || videos.length)) add(`type carousel needs 2 to ${LIMITS.facebook.carouselMax} images`);
    if (item.type === "reel") errors.push(...reelErrors(item, add, LIMITS.facebook.reelMin, LIMITS.facebook.reelMax));
  }

  if (platform === "instagram") {
    const text = composeText(item, platform);
    if (item.scheduled) add("Instagram has no scheduling API; set scheduled false (the publisher's cron posts it)");
    if (item.visibility !== "public") add("Instagram posts are public; set visibility public");
    if ([...text].length > LIMITS.instagram.captionLength) add(`caption longer than ${LIMITS.instagram.captionLength} characters`);
    const hashtagCount = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
    if (hashtagCount > LIMITS.instagram.hashtags) add(`more than ${LIMITS.instagram.hashtags} hashtags`);
    if ((text.match(/(^|\s)@[\w.]+/g) ?? []).length > LIMITS.instagram.mentions) add(`more than ${LIMITS.instagram.mentions} mentions`);
    for (const media of images) {
      if (!/\.jpe?g$/i.test(media.path)) add(`Instagram accepts only JPEG images: ${media.path}`);
      const r = ratio(media);
      if (item.type !== "story" && r !== null && (r < LIMITS.instagram.ratioMin - 0.005 || r > LIMITS.instagram.ratioMax + 0.005)) add(`image aspect ratio ${r.toFixed(2)} is outside 4:5 to 1.91:1: ${media.path}`);
    }
    if (item.type === "photo" && (images.length !== 1 || videos.length)) add("type photo needs exactly one image");
    if (item.type === "carousel" && (item.media.length < LIMITS.instagram.carouselMin || item.media.length > LIMITS.instagram.carouselMax)) add("type carousel needs 2 to 20 images or videos");
    if (item.type === "reel") errors.push(...reelErrors(item, add, LIMITS.instagram.reelMin, LIMITS.instagram.reelMax));
    if (item.type === "story") {
      if (item.media.length !== 1) add("type story needs exactly one image or video");
      if (videos[0]?.duration > LIMITS.instagram.storyVideoMax) add(`story video longer than ${LIMITS.instagram.storyVideoMax} s`);
    }
    if (item.type !== "story" && !text.trim()) add("caption is empty");
  }

  if (platform === "youtube") {
    if (!item.title?.trim()) add("title is required");
    if (/[<>]/.test(item.title ?? "")) add("title cannot contain < or >");
    const description = composeText(item, platform);
    if (/[<>]/.test(description)) add("description cannot contain < or >");
    if (Buffer.byteLength(description, "utf8") > LIMITS.youtube.descriptionBytes) add(`description longer than ${LIMITS.youtube.descriptionBytes} bytes`);
    const tagsLength = (item.tags ?? []).reduce((sum, tag) => sum + tag.length + (tag.includes(" ") ? 2 : 0), 0) + Math.max(0, (item.tags ?? []).length - 1);
    if (tagsLength > LIMITS.youtube.tagsLength) add(`tags longer than ${LIMITS.youtube.tagsLength} characters in total`);
    if (videos.length !== 1 || images.length) add(`type ${item.type} needs exactly one video`);
    if (item.scheduled && item.visibility !== "public") add("scheduled YouTube videos go public at publish_at; set visibility public");
    if (item.scheduled && forPublish && lead !== null && lead < LIMITS.youtube.minLeadSeconds) add("publish_at must be at least 15 minutes from now");
    if (item.type === "short") {
      const video = videos[0];
      if (video?.duration !== undefined && video.duration > LIMITS.youtube.shortMax) add(`Shorts are at most ${LIMITS.youtube.shortMax} s`);
      if (item.music && video?.duration !== undefined && video.duration > LIMITS.youtube.musicShortMax) add(`Shorts with music must be at most ${LIMITS.youtube.musicShortMax} s (a longer Short with a Content ID claim is blocked worldwide); cut it or drop the music`);
      if (video && ratio(video) !== null && ratio(video) > 1) add("Shorts must be vertical or square");
    }
    if (item.thumbnail && !/\.(jpe?g|png)$/i.test(item.thumbnail)) add("thumbnail must be JPEG or PNG");
  }

  if (platform === "linkedin") {
    const text = composeText(item, platform, language);
    if (item.scheduled) add("LinkedIn has no scheduling API; set scheduled false (the publisher's cron posts it)");
    if (item.visibility !== "public") add("LinkedIn Page posts are public; set visibility public");
    if (!text.trim()) add("caption is empty");
    if ([...text].length > LIMITS.linkedin.commentaryLength) add(`caption longer than ${LIMITS.linkedin.commentaryLength} characters`);
    if (item.type === "post" && item.media.length) add("type post has no media (use photo, carousel or video)");
    if (item.type === "photo" && (images.length !== 1 || videos.length)) add("type photo needs exactly one image");
    if (item.type === "carousel" && (images.length < LIMITS.linkedin.carouselMin || images.length > LIMITS.linkedin.carouselMax || videos.length)) add(`type carousel needs ${LIMITS.linkedin.carouselMin} to ${LIMITS.linkedin.carouselMax} images`);
    if (item.type === "video") {
      if (videos.length !== 1 || images.length) add("type video needs exactly one video");
      else if (!/\.mp4$/i.test(videos[0].path)) add("LinkedIn videos must be MP4");
      else if (videos[0].duration !== undefined && (videos[0].duration < LIMITS.linkedin.videoMin || videos[0].duration > LIMITS.linkedin.videoMax)) add(`video duration ${videos[0].duration} s is outside ${LIMITS.linkedin.videoMin} s to 30 min`);
    }
  }
  return errors;
}

function reelErrors(item, add, min, max) {
  const videos = item.media.filter((m) => m.kind === "video");
  if (videos.length !== 1 || item.media.length !== 1) { add("type reel needs exactly one video"); return []; }
  const video = videos[0];
  if (!/\.mp4$/i.test(video.path)) add("reels must be MP4");
  if (video.duration === undefined) add("reel duration unknown; run social-manifest.mjs probe");
  else if (video.duration < min || video.duration > max) add(`reel duration ${video.duration} s is outside ${min} to ${max} s`);
  if (video.width && video.height && !isVertical916(video)) add(`reel must be 9:16 (got ${video.width}x${video.height})`);
  return [];
}

function localDay(iso) {
  return iso.slice(0, 10);
}

export function validateManifest(manifest, { manifestDir = ".", checkFiles = true, forPublish = false, now = new Date() } = {}) {
  const errors = schemaErrors(manifest, manifestSchema());
  if (errors.length) return errors;
  const platform = manifest.platform;
  const ids = new Map();
  for (const item of manifest.items) ids.set(item.id, (ids.get(item.id) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1) errors.push(`duplicate item id: ${id}`);
  for (const item of manifest.items) errors.push(...itemRuleErrors(item, platform, { manifestDir, checkFiles, now, forPublish, language: manifest.language }));
  for (const item of manifest.items) {
    for (const story of item.with_stories ?? []) {
      const target = manifest.items.find((candidate) => candidate.id === story);
      if (platform !== "instagram") errors.push(`${item.id}: with_stories is Instagram only`);
      else if (!target || target.type !== "story") errors.push(`${item.id}: with_stories names ${story}, which is not a story item`);
    }
  }
  if (platform === "facebook") {
    const perDay = new Map();
    for (const item of manifest.items.filter((i) => i.type === "reel" && i.publish_at)) perDay.set(localDay(item.publish_at), (perDay.get(localDay(item.publish_at)) ?? 0) + 1);
    for (const [day, count] of perDay) if (count > LIMITS.facebook.reelsPerDay) errors.push(`${day}: more than ${LIMITS.facebook.reelsPerDay} reels in one day`);
  }
  if (forPublish && manifest.approval.status !== "approved") errors.push("batch is not approved (approval.status must be approved)");
  else if (forPublish && (manifest.approval.revision ?? 1) !== (manifest.review?.revision ?? 1)) errors.push(`approval is for revision ${manifest.approval.revision}, but the batch is at revision ${manifest.review?.revision ?? 1}`);
  return errors;
}

/** Links to the profile's site_domains must carry the profile's UTM parameters, before any #anchor. */
export function utmErrors(manifest, config) {
  const domains = config?.site_domains ?? [];
  if (!domains.length) return [];
  const utm = { source: "{platform}", medium: "social", campaign: null, ...(config.utm ?? {}) };
  const expect = (template) => new RegExp(`^${escapeRegExp(template).replaceAll("\\{platform\\}", manifest.platform).replaceAll("\\{theme\\}", "[a-z0-9-]+")}$`);
  const errors = [];
  for (const item of manifest.items) {
    const text = [composeText(item, manifest.platform, manifest.language), item.link ?? ""].join("\n");
    for (const raw of text.match(/https?:\/\/[^\s)<>"]+/g) ?? []) {
      let url;
      try {
        url = new URL(raw);
      } catch {
        errors.push(`${item.id}: invalid link ${raw}`);
        continue;
      }
      if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) continue;
      const params = url.searchParams;
      const ok = [["utm_source", utm.source], ["utm_medium", utm.medium], ["utm_campaign", utm.campaign]].every(([key, template]) => (template ? expect(template).test(params.get(key) ?? "") : params.has(key)));
      if (!ok) errors.push(`${item.id}: link without the profile UTM (utm_source=${utm.source.replace("{platform}", manifest.platform)}&utm_medium=${utm.medium}&utm_campaign=${utm.campaign ?? "<campaign>"}): ${raw}`);
    }
  }
  return errors;
}

export function approveManifest(manifest, { by, at = new Date() }) {
  if (!by) throw new ManifestError("approve needs --by <login>");
  manifest.approval = { status: "approved", by, at: at.toISOString(), revision: manifest.review?.revision ?? 1 };
  return manifest;
}

// ---------- state ----------

export function recordState(manifest, id, entry, now = new Date()) {
  const previous = manifest.state[id] ?? {};
  manifest.state[id] = { ...previous, ...entry, at: now.toISOString(), attempts: (previous.attempts ?? 0) + 1 };
  return manifest.state[id];
}

export function isDone(manifest, id) {
  return ["scheduled", "published", "skipped"].includes(manifest.state?.[id]?.status);
}

/** The final publish call got no response: the item may be live, so it is never retried without a check. */
export class UncertainError extends Error {}

export function needsCheck(manifest, id) {
  return manifest.state?.[id]?.status === "unknown";
}

/** Items to publish: not done, and not waiting for a manual check unless listed in retry. */
export function pendingItems(manifest, { only = null, retry = [] } = {}) {
  return manifest.items.filter((item) => !isDone(manifest, item.id) && (!needsCheck(manifest, item.id) || retry.includes(item.id)) && (!only || item.id === only));
}

export function reportBlocked(manifest, out, retry = []) {
  for (const item of manifest.items) {
    if (needsCheck(manifest, item.id) && !retry.includes(item.id)) out.write(`needs a manual check: ${item.id} may already be live (${manifest.state[item.id].error ?? "no response"}); confirm on the platform, then rerun with --retry ${item.id} if it is not\n`);
  }
}

/**
 * Splits pending items into those still schedulable and stale ones whose publish_at is now too close or past, so a
 * late approval skips only the stale items (reported) instead of rejecting the whole batch.
 */
export function splitStale(items, { now = new Date(), minLeadSeconds, execute = true } = {}) {
  const stale = execute ? items.filter((item) => item.scheduled && item.publish_at && (Date.parse(item.publish_at) - now.getTime()) / 1000 < minLeadSeconds) : [];
  return { ready: items.filter((item) => !stale.includes(item)), stale };
}

/** Runs the final, non-idempotent call: a network failure (no HTTP response) becomes an UncertainError. */
export async function finalCall(run) {
  try {
    return await run();
  } catch (error) {
    if (error.network) throw new UncertainError(error.message);
    throw error;
  }
}

// ---------- profile ----------

/** The JSON object in the first ```json block under the profile's "## Parameters" heading. */
export function readProfileConfig(profilePath) {
  const text = readFileSync(profilePath, "utf8");
  const heading = text.search(/^##\s+Parameters\b/m);
  if (heading < 0) throw new ManifestError(`${profilePath}: missing "## Parameters" section`);
  const match = text.slice(heading).match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) throw new ManifestError(`${profilePath}: the Parameters section needs a \`\`\`json block`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new ManifestError(`${profilePath}: invalid JSON in Parameters (${error.message})`);
  }
}

export function getPath(object, dotted) {
  return dotted.split(".").reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), object);
}

// ---------- time zones ----------

/** "+HH:MM" offset of an IANA zone at a given instant. */
export function zoneOffset(timeZone, instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const minutes = Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** ISO 8601 with offset for a local date and HH:MM in a zone. */
export function localIso(date, time, timeZone) {
  const guess = new Date(`${date}T${time}:00Z`);
  let offset = zoneOffset(timeZone, guess);
  const adjusted = new Date(`${date}T${time}:00${offset}`);
  offset = zoneOffset(timeZone, adjusted);
  return `${date}T${time}:00${offset}`;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { positional, flags };
}

export function main(argv, { out = process.stdout, err = process.stderr } = {}) {
  const { positional, flags } = parseArgs(argv);
  const [command, target] = positional;
  const usage = "usage: social-manifest.mjs <validate|probe|approve|text|config> <file> [flags]";
  if (!command || !target) { err.write(`${usage}\n`); return 2; }
  try {
    if (command === "config") {
      const config = readProfileConfig(target);
      let value = flags.platform ? { ...config, ...(config.platforms?.[flags.platform] ?? {}), platform: flags.platform } : config;
      if (flags.key) value = getPath(value, flags.key);
      out.write(`${typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)}\n`);
      return 0;
    }
    const manifest = loadManifest(target);
    const manifestDir = dirname(resolve(target));
    if (command === "validate") {
      const now = flags.now ? new Date(flags.now) : new Date();
      const errors = validateManifest(manifest, { manifestDir, checkFiles: !flags["no-files"], forPublish: Boolean(flags["for-publish"]), now });
      if (flags.profile) errors.push(...utmErrors(manifest, readProfileConfig(flags.profile)));
      if (errors.length) { err.write(`invalid manifest ${target}:\n- ${errors.join("\n- ")}\n`); return 1; }
      out.write(`ok: ${target} (${manifest.platform}, ${manifest.items.length} items)\n`);
      return 0;
    }
    if (command === "probe") {
      saveManifest(target, probeManifest(manifest, manifestDir));
      out.write(`probed: ${target}\n`);
      return 0;
    }
    if (command === "approve") {
      saveManifest(target, approveManifest(manifest, { by: flags.by, at: flags.at ? new Date(flags.at) : new Date() }));
      out.write(`approved: ${target} by ${flags.by}\n`);
      return 0;
    }
    if (command === "text") {
      for (const item of manifest.items) {
        if (flags.item && item.id !== flags.item) continue;
        out.write(`## ${item.id}\n${item.title ? `${item.title}\n\n` : ""}${composeText(item, manifest.platform, manifest.language)}\n\n`);
      }
      return 0;
    }
    err.write(`${usage}\n`);
    return 2;
  } catch (error) {
    if (error instanceof ManifestError) { err.write(`${error.message}\n`); return 1; }
    throw error;
  }
}

export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));

