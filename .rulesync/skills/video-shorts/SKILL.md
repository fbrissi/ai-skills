---
name: video-shorts
description: >-
  Make vertical 9:16 Shorts and Reels with Remotion from a scene spec: Piper TTS
  narration normalized to -16 LUFS, captions, real product screenshots or
  recordings with pan and zoom, a music bed from the project's Drive folder
  with ducking, an end card, and the voice and music credits for the
  description. Use when a Reel, Short, or short vertical video is needed for
  Instagram, Facebook, or YouTube, or the user asks to render or redo one.
---

# Video shorts

Script the scenes, generate the narration, render, watch the result, and hand the MP4 and its credits to the manifest.

## Inputs

- **Brief**: the item's theme, claims (with sources), and call to action, from `social-content-plan` or the user.
- **Profile**: default `docs/ai/social-content.md`: `brand`, `video.voice`, `video.length_scale`, `video.music`, `video.footnote`, and the Voice section (pronunciation).
- **Screens**: real screenshots or recordings the project provides or captures (profile Sources), with fictitious data. Never generate a fake product UI with AI. Realistic AI footage (Google Flow/Veo clips) only when supplied by a person, as `footage` scenes with `"synthetic": true`; see the `flow-video-ad` skill to plan them (if it is not installed, ask for the finished clips).
- **Requirements**: Node 22+, `ffmpeg` and `ffprobe`, Python with `piper-tts` (`PIPER_PYTHON`), and network for the first `npm ci` of the studio and the voice download.

Load [references/video-spec.md](references/video-spec.md) now for the spec format and the timing rules. Follow the `remotion-best-practices` skill when changing the studio in `assets/studio/`, and the `ffmpeg` skill for footage preparation, when they are installed.

## 1. Script

Write `<batch-dir>/specs/<item-id>.video.json`: a 1.5–2.5 s `hook`, two to four `screen` or `footage` scenes, an optional `statement`, and a `cta`. One short spoken sentence per scene (`voice`, shown as captions; `say` rewrites words only for pronunciation). Total 15–45 s; Facebook Reels must stay within 3–90 s, YouTube Shorts within 180 s. Run the `copy-guard` checker on the voice lines (`--text -`). If `copy-guard` is not installed, check them by hand for its rules: no em dashes, no "não é X, é Y" or "not X but Y", no engagement bait, no unsupported social proof, no result or savings promises.

## 2. Music

When the profile names a Drive folder, download the tracks once:

```bash
node <skill-dir>/scripts/drive.mjs download-folder --folder <video.music.drive_folder_id> --out .cache/video-shorts/music
```

Pick a track listed in `video.music.tracks` (its license feeds the credits) and set `music` in the spec. Without music, omit it.

## 3. Narration and render

```bash
node <skill-dir>/scripts/voice.mjs --spec <spec> --profile docs/ai/social-content.md
node <skill-dir>/scripts/render.mjs --spec <spec> --profile docs/ai/social-content.md --out <batch-dir>/media/<item-id>.mp4
```

`voice.mjs` downloads the Piper voice (default `pt_BR-faber-medium`) into `.cache/video-shorts/models`, writes one WAV per scene (silence trimmed, EQ, loudnorm −16 LUFS), and skips unchanged lines. `render.mjs` copies the studio template to `.cache/video-shorts/studio` (installing it once with `npm ci --ignore-scripts` from the bundled lockfile), renders 1080x1920 at 30 fps (H.264), normalizes the mix to −16 LUFS, and prints `{path, width, height, duration, synthetic_media, music}`. Add `.cache/` to `.gitignore`.

Watch the video, or at least extract a frame per scene (`ffmpeg -ss <t> -i <mp4> -frames:v 1 <png>`) and look at each: captions inside the safe area, the right screen in focus, nothing cut. Fix the spec and render again.

## 4. Credits and manifest

```bash
node <skill-dir>/scripts/credits.mjs --profile docs/ai/social-content.md --music <track file> [--lang pt-BR]
```

Put the output in the item's `credits` (it is appended to the caption or description). Add the MP4 to `media` with `kind: "video"`, `width`, `height`, `duration`; set `synthetic_media` from the render output and `spec` to the spec path. For YouTube, also render a thumbnail with `image-cards` (`yt-thumbnail`); if it is not installed, extract a clear frame of the video as a 1280x720 JPEG (`ffmpeg -ss <t> -i <mp4> -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -frames:v 1 thumb.jpg`) or leave `thumbnail` empty.

## Output

```text
Video: <item-id> <duration> s 1080x1920 (<path>)
Voice: <voice> | Music: <track or none> | Synthetic media: <yes/no>
Credits: added to <item-id>
```
