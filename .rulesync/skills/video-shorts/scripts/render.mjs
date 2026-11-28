#!/usr/bin/env node
// Renders a 9:16 Short/Reel from a video spec with the bundled Remotion studio, then normalizes the mix to
// -16 LUFS integrated (two-pass ffmpeg loudnorm, video stream copied). Run voice.mjs first.
// When the profile sets video.screen_disclaimer, every product screen gets it under it and the render stops when one
// lacks it. Without it (opt-in) product screens render bare and the render warns.
// Usage: render.mjs --spec <video.json> --out <file.mp4> [--profile <profile.md>] [--work .cache/video-shorts]
//        [--studio <dir with node_modules>] [--no-music] [--allow-cut-edges]
// Screen focus/pan_to frames whose edges slice UI text or controls are refused (luminance scan of the screenshot);
// --allow-cut-edges skips that scan for a frame you checked by eye.
// Prints {path, width, height, duration, synthetic_media, ai_audio, ai_audio_engine, voice, music} (music: the manifest entry with license
// evidence, checked against its sha256). Paths in the spec are relative to the current
// directory (the repository root).
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize, isMain, readProfileConfig, videoInfo } from "./social-manifest.mjs";
import { sceneTiming, totalSeconds } from "./timing.mjs";
import { musicEntry } from "./credits.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, "../assets/studio");
const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };
const DEFAULT_COLORS = { background: "#f5f7fa", ink: "#14213d", primary: "#2d5bab", on_primary: "#ffffff", accent: "#2a7d45", muted: "#4a5d78" };

export class RenderError extends Error {}

/** The window that shows screens and footage in Short.tsx (L.screen): 1000x720 on the 1080x1920 canvas. */
export const SCREEN_FRAME = { width: 1000, height: 720 };
/** Longest screen disclaimer that fits one line under the screen frame. */
export const DISCLAIMER_MAX = 80;

/** The profile's required line under every product screen (video.screen_disclaimer), or null. */
export function screenDisclaimer(config) {
  const text = config?.video?.screen_disclaimer;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

/** Scenes that show the product: screenshots, and recordings that are not AI-generated footage. */
export function showsProductScreen(scene) {
  return scene.kind === "screen" || (scene.kind === "footage" && scene.synthetic !== true);
}

/** Same camera as ScreenImage in Short.tsx: the box fills the frame, never zooming out past cover nor in past 2.4x cover. */
export function screenCamera(box, image, frame = SCREEN_FRAME) {
  const cover = Math.max(frame.width / image.width, frame.height / image.height);
  const scale = Math.max(cover, Math.min(frame.width / box.w, frame.height / box.h, cover * 2.4));
  return { scale, visibleWidth: frame.width / scale, visibleHeight: frame.height / scale };
}

/** A camera box that the frame cannot show whole: its edges, and any label or sidebar item on them, get cut. */
export function boxFitError(where, name, box, image) {
  if (box.x < 0 || box.y < 0 || box.x + box.w > image.width + 0.5 || box.y + box.h > image.height + 0.5) return `${where}: ${name} box goes past the image (${image.width}x${image.height})`;
  const camera = screenCamera(box, image);
  if (box.w <= camera.visibleWidth + 1 && box.h <= camera.visibleHeight + 1) return null;
  return `${where}: ${name} box ${box.w}x${box.h} does not fit the ${SCREEN_FRAME.width}x${SCREEN_FRAME.height} screen frame: the camera shows at most ${Math.round(camera.visibleWidth)}x${Math.round(camera.visibleHeight)} image pixels at that zoom, so the box edges (labels, sidebar items, buttons) would be cut; use a box with the frame's ${SCREEN_FRAME.width}:${SCREEN_FRAME.height} aspect inside the image`;
}

/** The image rectangle (in image pixels) the frame shows for a camera box, clamped to the image like Short.tsx. */
export function visibleRect(box, image, frame = SCREEN_FRAME) {
  const { scale } = screenCamera(box, image, frame);
  const offsetX = Math.min(0, Math.max(frame.width - image.width * scale, frame.width / 2 - (box.x + box.w / 2) * scale));
  const offsetY = Math.min(0, Math.max(frame.height - image.height * scale, frame.height / 2 - (box.y + box.h / 2) * scale));
  return { x: -offsetX / scale + 0, y: -offsetY / scale + 0, w: frame.width / scale, h: frame.height / scale };
}

/** Edge check tuning, in image pixels and 0-255 luminance. */
export const EDGE_CHECK = { margin: 6, span: 10, ink: 40, flat: 24, minHits: 3 };

/**
 * Frame edges that slice UI content. Each edge inside the image (an image edge is the screenshot's own end) and the
 * `margin` pixels inward are scanned: a pixel off the line's background whose neighbourhood across the edge is not
 * flat is a glyph or control being cut. Flat crossings (dividers, borders, filled panels) are allowed.
 * gray: {width, height, data} with one luminance byte per pixel.
 */
export function edgeCuts(gray, rect, tuning = EDGE_CHECK) {
  const { width, height, data } = gray;
  const at = (x, y) => data[y * width + x];
  const x0 = Math.round(rect.x);
  const y0 = Math.round(rect.y);
  const x1 = Math.min(width, Math.round(rect.x + rect.w)) - 1;
  const y1 = Math.min(height, Math.round(rect.y + rect.h)) - 1;
  const edges = [];
  if (x0 > 0) edges.push({ edge: "left", vertical: true, pos: x0, step: 1 });
  if (x1 < width - 1) edges.push({ edge: "right", vertical: true, pos: x1, step: -1 });
  if (y0 > 0) edges.push({ edge: "top", vertical: false, pos: y0, step: 1 });
  if (y1 < height - 1) edges.push({ edge: "bottom", vertical: false, pos: y1, step: -1 });
  const cuts = [];
  for (const { edge, vertical, pos, step } of edges) {
    const [from, to] = vertical ? [Math.max(0, y0), y1] : [Math.max(0, x0), x1];
    const hits = new Set();
    for (let d = 0; d <= tuning.margin; d += 1) {
      const line = pos + d * step;
      const sample = (t) => (vertical ? at(line, t) : at(t, line));
      const values = [];
      for (let t = from; t <= to; t += 1) values.push(sample(t));
      const background = [...values].sort((a, b) => a - b)[values.length >> 1];
      for (let t = from; t <= to; t += 1) {
        if (Math.abs(sample(t) - background) <= tuning.ink) continue;
        let low = 255;
        let high = 0;
        const limit = vertical ? width : height;
        for (let k = Math.max(0, line - tuning.span); k <= Math.min(limit - 1, line + tuning.span); k += 1) {
          const value = vertical ? at(k, t) : at(t, k);
          low = Math.min(low, value);
          high = Math.max(high, value);
        }
        if (high - low >= tuning.flat) hits.add(t);
      }
    }
    if (hits.size >= tuning.minHits) {
      const sorted = [...hits].sort((a, b) => a - b);
      cuts.push({ edge, at: pos, from: sorted[0], to: sorted.at(-1) });
    }
  }
  return cuts;
}

/** Spec errors for camera boxes whose frame edges slice UI text or controls, given the screenshot's luminance. */
export function cutEdgeErrors(where, name, box, gray) {
  const rect = visibleRect(box, { width: gray.width, height: gray.height });
  return edgeCuts(gray, rect).map((cut) => `${where}: ${name} frame ${cut.edge} edge (${cut.edge === "left" || cut.edge === "right" ? "x" : "y"}=${cut.at}) cuts UI content between ${cut.edge === "left" || cut.edge === "right" ? "y" : "x"}=${cut.from} and ${cut.to}; move or resize the box so the edge falls on empty background with a margin, make it span the full screenshot ${cut.edge === "left" || cut.edge === "right" ? "width" : "height"}, or crop the screenshot to the useful area when capturing it`);
}

/** Screenshot luminance through ffmpeg (already required for rendering), or null when it cannot be decoded. */
export function readGray(path) {
  const size = imageSize(path);
  if (!size?.width || !size?.height) return null;
  try {
    const data = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: size.width * size.height + 1024 * 1024 });
    return data.length >= size.width * size.height ? { width: size.width, height: size.height, data } : null;
  } catch {
    return null;
  }
}

/** Footage fills the frame with object-fit cover: a clip of another aspect loses its sides or its top and bottom. */
export function footageFitError(where, width, height) {
  const target = SCREEN_FRAME.width / SCREEN_FRAME.height;
  const aspect = width / height;
  if (Math.abs(aspect - target) / target <= 0.02) return null;
  const wide = aspect > target;
  const lost = Math.round((1 - (wide ? target / aspect : aspect / target)) * 100);
  const suggestion = wide ? `${Math.round(height * target)}:${height}:x:y` : `${width}:${Math.round(width / target)}:x:y`;
  return `${where}: footage ${width}x${height} is cut to the ${SCREEN_FRAME.width}:${SCREEN_FRAME.height} screen frame (${lost}% of its ${wide ? "width" : "height"} is lost); crop it to that aspect (for example ${suggestion})`;
}

/** Spec checks that keep fake product UIs, missing files, cut screens, and an oversized disclaimer out before rendering. */
export function specErrors(spec, root = process.cwd(), config = null, { pixels = null } = {}) {
  const errors = [];
  const disclaimer = screenDisclaimer(config);
  if (disclaimer && disclaimer.length > DISCLAIMER_MAX) errors.push(`video.screen_disclaimer has ${disclaimer.length} characters; keep it within ${DISCLAIMER_MAX} so it fits one line under the screen`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.id ?? "")) errors.push("id must be kebab-case");
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) errors.push("scenes is required");
  for (const scene of spec.scenes ?? []) {
    const where = `scene ${scene.id ?? "?"}`;
    if (!scene.id) errors.push(`${where}: id is required`);
    if (scene.kind === "screen" && !scene.image) errors.push(`${where}: screen scenes need an image (a real screenshot the project provides)`);
    if (scene.kind === "footage" && !scene.video) errors.push(`${where}: footage scenes need a video (a real recording or a supplied clip)`);
    for (const path of [scene.image, scene.video].filter(Boolean)) if (!existsSync(resolve(root, path))) errors.push(`${where}: file not found: ${path}`);
    if (scene.generated_ui) errors.push(`${where}: AI-generated product UI is not allowed; use a real screenshot or recording`);
    if (scene.kind === "screen" && scene.image && existsSync(resolve(root, scene.image))) {
      const size = imageSize(resolve(root, scene.image));
      if (size?.width && size?.height) {
        const image = { width: size.width, height: size.height };
        const gray = pixels ? pixels(resolve(root, scene.image)) : null;
        for (const [name, box] of [["focus", scene.focus ?? { x: 0, y: 0, w: image.width, h: image.height }], ["pan_to", scene.pan_to]]) {
          const error = box ? boxFitError(where, name, box, image) : null;
          if (error) errors.push(error);
          else if (box && gray?.width === image.width && gray?.height === image.height) errors.push(...cutEdgeErrors(where, name, box, gray));
        }
      }
    }
    if (scene.kind === "footage" && scene.crop) {
      const [width, height] = String(scene.crop).split(":").map(Number);
      const error = width > 0 && height > 0 ? footageFitError(where, width, height) : `${where}: crop must be w:h:x:y in pixels`;
      if (error) errors.push(error);
    }
  }
  if (spec.music && !existsSync(resolve(root, spec.music))) errors.push(`music not found: ${spec.music} (download it with drive.mjs download-folder)`);
  return errors;
}

function sh(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new RenderError(`${cmd} ${args[0]} failed (exit ${result.status})`);
}

function prepareStudio(work, studioOverride) {
  if (studioOverride) return resolve(studioOverride);
  const studio = join(work, "studio");
  const lock = (dir) => (existsSync(join(dir, "package-lock.json")) ? readFileSync(join(dir, "package-lock.json"), "utf8") : null);
  if (lock(studio) !== lock(TEMPLATE)) rmSync(join(studio, "node_modules"), { recursive: true, force: true });
  cpSync(TEMPLATE, studio, { recursive: true });
  // Pinned by the bundled lockfile; install scripts stay off (Remotion's platform binaries are optional dependencies).
  if (!existsSync(join(studio, "node_modules", ".bin", "remotion"))) sh("npm", ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: studio });
  return studio;
}

function cutClip(scene, source, output) {
  const args = ["-v", "error", "-y"];
  if (scene.from !== undefined) args.push("-ss", String(scene.from));
  if (scene.to !== undefined) args.push("-to", String(scene.to));
  args.push("-i", source, "-vf", [scene.crop ? `crop=${scene.crop}` : null, "fps=30", "setsar=1"].filter(Boolean).join(","), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  execFileSync("ffmpeg", args);
  return videoInfo(output)?.duration ?? null;
}

export function normalizeLoudness(input, output) {
  const filter = `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", `${filter}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const measured = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf("{"), probe.stderr.lastIndexOf("}") + 1));
  const second = `${filter}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-c:v", "copy", "-af", second, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", output]);
}

/** Product screens rendered without any disclaimer because the profile sets none (opt-in), by scene id. */
export function undisclaimedScreens(props, config) {
  if (screenDisclaimer(config)) return [];
  return props.scenes.filter((scene) => showsProductScreen(scene)).map((scene) => scene.id);
}

/** When the profile sets a disclaimer, every product screen in the render props must carry it, exactly. */
export function disclaimerErrors(props, config) {
  const required = screenDisclaimer(config);
  if (!required) return [];
  return props.scenes.filter((scene) => showsProductScreen(scene) && scene.disclaimer !== required).map((scene) => `scene ${scene.id}: shows a product screen without the profile's video.screen_disclaimer`);
}

/** ai_audio, the TTS engine and the voice of the rendered narration (voice.json entries from voice.mjs). */
export function narrationInfo(scenes, voice) {
  const voiced = scenes.filter((scene) => scene.voiceFile).map((scene) => voice[scene.id]).filter(Boolean);
  if (!voiced.length) return { ai_audio: false, ai_audio_engine: null, voice: null };
  return { ai_audio: true, ai_audio_engine: voiced[0].engine ?? "piper", voice: voiced[0].voice ?? null };
}

export function buildProps(spec, { config, root, jobDir, jobPublic, voice, music }) {
  const brand = config?.brand ?? {};
  const disclaimer = screenDisclaimer(config);
  mkdirSync(jobDir, { recursive: true });
  const copy = (path, name) => {
    copyFileSync(resolve(root, path), join(jobDir, name));
    return `${jobPublic}/${name}`;
  };
  const fontFile = brand.font?.files?.[0] ? copy(typeof brand.font.files[0] === "string" ? brand.font.files[0] : brand.font.files[0].path, `font${extname(typeof brand.font.files[0] === "string" ? brand.font.files[0] : brand.font.files[0].path)}`) : null;
  const scenes = spec.scenes.map((scene, index) => {
    const entry = { id: scene.id, kind: scene.kind, caption: scene.voice ?? "", title: scene.title, highlight: scene.highlight, headline: scene.headline, body: scene.body, url: scene.url, label: scene.label, focus: scene.focus, panTo: scene.pan_to, synthetic: scene.synthetic === true ? true : undefined, disclaimer: disclaimer && showsProductScreen(scene) ? disclaimer : undefined };
    let clipSeconds = null;
    if (scene.image) {
      entry.image = copy(scene.image, `${index}-${basename(scene.image)}`);
      const size = imageSize(resolve(root, scene.image));
      if (size) Object.assign(entry, { imageWidth: size.width, imageHeight: size.height });
    }
    if (scene.video) {
      const name = `${index}-${basename(scene.video, extname(scene.video))}.mp4`;
      clipSeconds = cutClip(scene, resolve(root, scene.video), join(jobDir, name));
      entry.video = `${jobPublic}/${name}`;
    }
    const voiced = voice[scene.id];
    if (scene.voice && voiced) {
      copyFileSync(join(voice.__dir, `${scene.id}.wav`), join(jobDir, `${scene.id}.wav`));
      entry.voiceFile = `${jobPublic}/${scene.id}.wav`;
    } else entry.voiceFile = null;
    Object.assign(entry, sceneTiming(scene, { voiceSeconds: voiced?.duration ?? null, clipSeconds }));
    for (const key of Object.keys(entry)) if (entry[key] === undefined) delete entry[key];
    return entry;
  });
  const logo = brand.logo ? copy(brand.logo, `logo${extname(brand.logo)}`) : null;
  return {
    brand: { colors: { ...DEFAULT_COLORS, ...(brand.colors ?? {}) }, fontFamily: brand.font?.family ?? "system-ui", fontFile, logo },
    music: music ? copy(music, `music${extname(music)}`) : null,
    footnote: spec.footnote ?? config?.video?.footnote ?? null,
    scenes,
  };
}

export function main(argv) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("spec") || !value("out")) throw new RenderError("usage: render.mjs --spec <video.json> --out <file.mp4> [--profile <md>] [--work <dir>] [--studio <dir>] [--no-music] [--allow-cut-edges]");
  const root = process.cwd();
  const spec = JSON.parse(readFileSync(value("spec"), "utf8"));
  const config = value("profile") ? readProfileConfig(value("profile")) : null;
  const allowCuts = argv.includes("--allow-cut-edges");
  const pixels = (path) => {
    const gray = readGray(path);
    if (!gray) process.stderr.write(`warning: could not decode ${path} with ffmpeg; its frame edges were not scanned for cut UI text\n`);
    return gray;
  };
  const errors = specErrors(spec, root, config, { pixels: allowCuts ? null : pixels });
  for (const scene of spec.scenes ?? []) {
    if (scene.kind !== "footage" || scene.crop || !scene.video || !existsSync(resolve(root, scene.video))) continue;
    const info = videoInfo(resolve(root, scene.video));
    const error = info?.width && info?.height ? footageFitError(`scene ${scene.id}`, info.width, info.height) : null;
    if (error) errors.push(error);
  }
  if (errors.length) throw new RenderError(`invalid video spec:\n- ${errors.join("\n- ")}`);
  const work = resolve(value("work") ?? ".cache/video-shorts");
  const voiceDir = join(work, "voice", spec.id);
  const voice = existsSync(join(voiceDir, "voice.json")) ? JSON.parse(readFileSync(join(voiceDir, "voice.json"), "utf8")) : {};
  voice.__dir = voiceDir;
  const missingVoice = spec.scenes.filter((scene) => scene.voice && !voice[scene.id]).map((scene) => scene.id);
  if (missingVoice.length) process.stderr.write(`warning: no narration for ${missingVoice.join(", ")}; run voice.mjs first (timing is estimated)\n`);
  const studio = prepareStudio(work, value("studio"));
  const jobPublic = `job/${spec.id}`;
  const jobDir = join(studio, "public", jobPublic);
  rmSync(jobDir, { recursive: true, force: true });
  const music = argv.includes("--no-music") ? null : spec.music ?? null;
  // Music needs license evidence in the profile and must match its recorded hash before anything renders.
  const musicInfo = music ? (config ? musicEntry(config, resolve(root, music)) : null) : null;
  if (music && !config) throw new RenderError("music needs --profile so its license evidence can be checked");
  const props = buildProps(spec, { config, root, jobDir, jobPublic, voice, music });
  const missingDisclaimer = disclaimerErrors(props, config);
  if (missingDisclaimer.length) throw new RenderError(`invalid render props:\n- ${missingDisclaimer.join("\n- ")}`);
  const bareScreens = undisclaimedScreens(props, config);
  if (bareScreens.length) process.stderr.write(`warning: ${bareScreens.join(", ")} show product screens and the profile sets no video.screen_disclaimer\n`);
  const propsPath = join(work, `${spec.id}.props.json`);
  writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  const out = resolve(value("out"));
  mkdirSync(dirname(out), { recursive: true });
  const raw = out.replace(/\.mp4$/i, ".raw.mp4");
  sh(join(studio, "node_modules", ".bin", "remotion"), ["render", "src/index.ts", "Short", raw, `--props=${propsPath}`, "--audio-codec=aac", "--audio-bitrate=320k"], { cwd: studio });
  normalizeLoudness(raw, out);
  rmSync(raw, { force: true });
  const info = videoInfo(out) ?? {};
  const result = {
    path: value("out"),
    width: info.width ?? 1080,
    height: info.height ?? 1920,
    duration: Math.round((info.duration ?? totalSeconds(props.scenes)) * 100) / 100,
    synthetic_media: spec.scenes.some((scene) => scene.synthetic === true),
    ...narrationInfo(props.scenes, voice),
    music: musicInfo,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
