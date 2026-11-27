#!/usr/bin/env node
// Renders a 9:16 Short/Reel from a video spec with the bundled Remotion studio, then normalizes the mix to
// -16 LUFS integrated (two-pass ffmpeg loudnorm, video stream copied). Run voice.mjs first.
// Usage: render.mjs --spec <video.json> --out <file.mp4> [--profile <profile.md>] [--work .cache/video-shorts]
//        [--studio <dir with node_modules>] [--no-music]
// Prints {path, width, height, duration, synthetic_media, music}. Paths in the spec are relative to the current
// directory (the repository root).
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize, isMain, readProfileConfig, videoInfo } from "./social-manifest.mjs";
import { sceneTiming, totalSeconds } from "./timing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, "../assets/studio");
const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };
const DEFAULT_COLORS = { background: "#f5f7fa", ink: "#14213d", primary: "#2d5bab", on_primary: "#ffffff", accent: "#2a7d45", muted: "#4a5d78" };

export class RenderError extends Error {}

/** Spec checks that keep fake product UIs and missing files out before anything renders. */
export function specErrors(spec, root = process.cwd()) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.id ?? "")) errors.push("id must be kebab-case");
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) errors.push("scenes is required");
  for (const scene of spec.scenes ?? []) {
    const where = `scene ${scene.id ?? "?"}`;
    if (!scene.id) errors.push(`${where}: id is required`);
    if (scene.kind === "screen" && !scene.image) errors.push(`${where}: screen scenes need an image (a real screenshot the project provides)`);
    if (scene.kind === "footage" && !scene.video) errors.push(`${where}: footage scenes need a video (a real recording or a supplied clip)`);
    for (const path of [scene.image, scene.video].filter(Boolean)) if (!existsSync(resolve(root, path))) errors.push(`${where}: file not found: ${path}`);
    if (scene.generated_ui) errors.push(`${where}: AI-generated product UI is not allowed; use a real screenshot or recording`);
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
  const templatePackage = readFileSync(join(TEMPLATE, "package.json"), "utf8");
  const current = existsSync(join(studio, "package.json")) ? readFileSync(join(studio, "package.json"), "utf8") : null;
  if (current !== templatePackage) rmSync(join(studio, "node_modules"), { recursive: true, force: true });
  cpSync(TEMPLATE, studio, { recursive: true });
  if (!existsSync(join(studio, "node_modules", ".bin", "remotion"))) sh("npm", ["install", "--no-audit", "--no-fund"], { cwd: studio });
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

export function buildProps(spec, { config, root, jobDir, jobPublic, voice, music }) {
  const brand = config?.brand ?? {};
  mkdirSync(jobDir, { recursive: true });
  const copy = (path, name) => {
    copyFileSync(resolve(root, path), join(jobDir, name));
    return `${jobPublic}/${name}`;
  };
  const fontFile = brand.font?.files?.[0] ? copy(typeof brand.font.files[0] === "string" ? brand.font.files[0] : brand.font.files[0].path, `font${extname(typeof brand.font.files[0] === "string" ? brand.font.files[0] : brand.font.files[0].path)}`) : null;
  const scenes = spec.scenes.map((scene, index) => {
    const entry = { id: scene.id, kind: scene.kind, caption: scene.voice ?? "", title: scene.title, highlight: scene.highlight, headline: scene.headline, body: scene.body, url: scene.url, label: scene.label, focus: scene.focus, panTo: scene.pan_to };
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
    footnote: spec.footnote ?? null,
    scenes,
  };
}

export function main(argv) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("spec") || !value("out")) throw new RenderError("usage: render.mjs --spec <video.json> --out <file.mp4> [--profile <md>] [--work <dir>] [--studio <dir>] [--no-music]");
  const root = process.cwd();
  const spec = JSON.parse(readFileSync(value("spec"), "utf8"));
  const errors = specErrors(spec, root);
  if (errors.length) throw new RenderError(`invalid video spec:\n- ${errors.join("\n- ")}`);
  const config = value("profile") ? readProfileConfig(value("profile")) : null;
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
  const props = buildProps(spec, { config, root, jobDir, jobPublic, voice, music });
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
    music: music ? basename(music) : null,
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
