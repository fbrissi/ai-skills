#!/usr/bin/env node
// Extracts the first and last settled frame of every screen and footage scene of a rendered Short, full frame and
// cropped to the screen window, so the agent can look at each frame's edges for cut UI text before handing it over.
// Usage: frames.mjs --video <file.mp4> --props <work>/<spec id>.props.json --out <dir>
// render.mjs writes the props file to its work directory (default .cache/video-shorts/<spec id>.props.json).
// Prints [{id, kind, first: {at, frame, screen}, last: {at, frame, screen}}].
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "./social-manifest.mjs";
import { FPS } from "./timing.mjs";

/** The screen window on the 1080x1920 canvas (L.screen in Short.tsx). */
export const SCREEN_WINDOW = { x: 40, y: 560, w: 1000, h: 720 };
/** Frames the window needs to fade and scale in (ScreenFrame in Short.tsx). */
export const SETTLE_FRAMES = 18;

/** Seconds of the first settled and the last frame of each screen and footage scene. */
export function sceneFrames(props, fps = FPS) {
  const frames = [];
  let start = 0;
  for (const scene of props.scenes) {
    if (scene.kind === "screen" || scene.kind === "footage") {
      const first = start + Math.min(SETTLE_FRAMES, scene.durationInFrames - 1);
      const last = start + scene.durationInFrames - 2;
      frames.push({ id: scene.id, kind: scene.kind, first: Math.round((first / fps) * 1000) / 1000, last: Math.round((Math.max(first, last) / fps) * 1000) / 1000 });
    }
    start += scene.durationInFrames;
  }
  return frames;
}

function extract(video, at, path, crop = null) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", video, ...(crop ? ["-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`] : []), "-frames:v", "1", path]);
  return path;
}

export function main(argv) {
  const value = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (!value("video") || !value("props") || !value("out")) throw new Error("usage: frames.mjs --video <file.mp4> --props <props.json> --out <dir>");
  const props = JSON.parse(readFileSync(value("props"), "utf8"));
  const out = value("out");
  mkdirSync(out, { recursive: true });
  const report = sceneFrames(props).map((scene) => {
    const entry = { id: scene.id, kind: scene.kind };
    for (const which of ["first", "last"]) {
      const at = scene[which];
      entry[which] = { at, frame: extract(value("video"), at, join(out, `${scene.id}-${which}.png`)), screen: extract(value("video"), at, join(out, `${scene.id}-${which}-screen.png`), SCREEN_WINDOW) };
    }
    return entry;
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
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
