// Scene timing for the Remotion studio: each scene lasts at least its kind's minimum, or its voice line plus a
// short lead and tail; screen recordings speed up to at most 2x to fit. Pure functions, tested on their own.
export const FPS = 30;
export const LEAD = 0.25;
export const HOOK_LEAD = 0.1;
export const TAIL = 0.5;
export const CTA_HOLD = 0.6;
export const MAX_FOOTAGE_RATE = 2;
export const MIN_SECONDS = { hook: 2.4, screen: 4, footage: 3.5, statement: 3.5, cta: 5.5 };
export const KINDS = Object.keys(MIN_SECONDS);

/** Without a generated voice, about 2.6 words per second. */
export function estimateSeconds(text) {
  return String(text ?? "").split(/\s+/).filter(Boolean).length / 2.6;
}

export function sceneTiming(scene, { voiceSeconds = null, clipSeconds = null } = {}) {
  if (!KINDS.includes(scene.kind)) throw new Error(`${scene.id}: unknown scene kind ${scene.kind} (${KINDS.join(", ")})`);
  const voice = voiceSeconds ?? estimateSeconds(scene.voice);
  const lead = scene.kind === "hook" ? HOOK_LEAD : LEAD;
  let seconds = Math.max(MIN_SECONDS[scene.kind], scene.voice ? lead + voice + TAIL : 0);
  if (scene.kind === "cta") seconds += CTA_HOLD;
  if (clipSeconds) seconds = Math.max(seconds, clipSeconds / MAX_FOOTAGE_RATE);
  if (scene.min_seconds) seconds = Math.max(seconds, scene.min_seconds);
  const durationInFrames = Math.round(seconds * FPS);
  return {
    durationInFrames,
    voiceFrom: Math.round(lead * FPS),
    voiceFrames: Math.round(voice * FPS),
    playbackRate: clipSeconds ? clipSeconds / (durationInFrames / FPS) : 1,
  };
}

export function totalSeconds(scenes) {
  return scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0) / FPS;
}
