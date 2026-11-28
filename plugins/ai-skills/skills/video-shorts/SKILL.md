---
name: video-shorts
description: >-
  Make vertical 9:16 Shorts and Reels with Remotion from a scene spec: Piper TTS
  or Azure AI Speech narration normalized to -16 LUFS, captions, real product
  screenshots or recordings with pan and zoom, a music bed from the project's
  Drive folder with ducking, an end card, and the voice and music credits for
  the description. Use when a Reel, Short, or short vertical video is needed for
  Instagram, Facebook, or YouTube, or the user asks to render or redo one.
---
# Video shorts

Script the scenes, generate the narration, render, watch the result, and hand the MP4 and its credits to the manifest.

## Inputs

- **Brief**: the item's theme, claims (with sources), and call to action, from `social-content-plan` or the user.
- **Profile**: default `docs/ai/social-content.md`: `brand`, `video.tts` (engine and allowed voices) or `video.voice`, `video.length_scale` (Piper), `video.music`, `video.footnote`, `video.screen_disclaimer`, and the Voice section (pronunciation). When the profile's prose requires a line on product screens but `video.screen_disclaimer` is not set, stop and ask for it (in a non-interactive run, report it as a blocker); never type the line into the spec yourself.
- **Screens**: real screenshots or recordings the project provides or captures (profile Sources), with fictitious data. Never generate a fake product UI with AI. Realistic AI footage (Google Flow/Veo clips) only when supplied by a person, as `footage` scenes with `"synthetic": true`; see the `flow-video-ad` skill to plan them (if it is not installed, ask for the finished clips).
- **Requirements**: Node 22+, `ffmpeg` and `ffprobe`, and network for the first `npm ci` of the studio. Piper (the default engine) needs Python with `piper-tts` (`PIPER_PYTHON`) and network for the voice download; Azure AI Speech (`video.tts.engine: "azure"`) needs only network and `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the environment (never print or commit the key).

Load [references/video-spec.md](references/video-spec.md) now for the spec format and the timing rules. Follow the `remotion-best-practices` skill when changing the studio in `assets/studio/`, and the `ffmpeg` skill for footage preparation, when they are installed.

## 1. Script

Write `<batch-dir>/specs/<item-id>.video.json` with the item's `voice` when the manifest item has one (assigned at planning; when `video.tts.voices` lists more than one voice, `voice.mjs` refuses a spec without it, and a voice outside the list): a 1.5–2.5 s `hook`, two to four `screen` or `footage` scenes, an optional `statement`, and a `cta`. One short spoken sentence per scene (`voice`, shown as captions; `say` rewrites words only for pronunciation). Prefer screenshots captured or cropped to the useful area (the panel or list the scene talks about, at the frame's 1000:720 aspect) over zooming into a full-page capture. Give each `screen` a `focus` box (and `pan_to`) with the frame's 1000:720 aspect that either spans the full screenshot width or puts every edge on empty background with a margin from any text or control: never put a box edge through a label, filter, sidebar item, or button. Crop `footage` to 1000:720 too. Total 15–45 s; Facebook Reels must stay within 3–90 s, YouTube Shorts within 180 s. Run the `copy-guard` checker on the voice lines (`--text -`). If `copy-guard` is not installed, check them by hand for its rules: no em dashes, no "não é X, é Y" or "not X but Y", no engagement bait, no unsupported social proof, no result or savings promises.

## 2. Music

When the profile names a Drive folder, download the tracks once:

```bash
node <skill-dir>/scripts/drive.mjs download-folder --folder <video.music.drive_folder_id> --out .cache/video-shorts/music
```

Pick a track listed in `video.music.tracks` and set `music` in the spec. Every track needs `license_url`, `evidence` (the Drive file id of the license evidence, such as the download page saved as PDF), and `sha256` of the file in the profile: `render.mjs` refuses music without them or whose file hash differs. A YouTube Short with music must stay at most 60 s. Without music, omit it.

The bed plays at `video.music.bed_volume` between narration lines (default `0.18`) and ducks to `video.music.ducked_volume` under the voice (default `0.07`). Both are gains greater than 0 and at most 1, and the ducked level must not be louder than the bed. A spec may override either for one video with `"music_volume": {"bed": 0.22, "ducked": 0.08}` (a missing key falls back to the profile, then the default). `render.mjs` refuses invalid levels before rendering, naming the key.

## 3. Narration and render

```bash
node <skill-dir>/scripts/voice.mjs --spec <spec> --profile docs/ai/social-content.md
node <skill-dir>/scripts/render.mjs --spec <spec> --profile docs/ai/social-content.md --out <batch-dir>/media/<item-id>.mp4
```

`voice.mjs` synthesizes each line with the profile's engine: Piper downloads its voice (default `pt_BR-faber-medium`) into `.cache/video-shorts/models`; Azure calls the Speech REST API of `AZURE_SPEECH_REGION` (48 kHz WAV). Both get the same post-processing into one WAV per scene (silence trimmed, EQ, loudnorm −16 LUFS), and unchanged lines (same text, engine, voice, and speed) are skipped. `render.mjs` copies the studio template to `.cache/video-shorts/studio` (installing it once with `npm ci --ignore-scripts` from the bundled lockfile), renders 1080x1920 at 30 fps (H.264), normalizes the mix to −16 LUFS, and prints `{path, width, height, duration, synthetic_media, ai_audio, ai_audio_engine, voice, music}`. It draws `video.screen_disclaimer` under every `screen` scene and every `footage` scene that is not `synthetic`, and refuses to render when one lacks it, when the disclaimer does not fit one line, when a `focus` or `pan_to` box cannot be shown whole (the frame would cut its edges), when a frame edge slices UI content (it scans the screenshot's pixels along each edge inside the image and names the edge and the rows or columns it cuts; `--allow-cut-edges` skips the scan for a frame you checked by eye), or when footage is not cropped to the frame aspect. Add `.cache/` to `.gitignore`.

Then extract the first settled and the last frame of every screen and footage scene, full and cropped to the screen window:

```bash
node <skill-dir>/scripts/frames.mjs --video <batch-dir>/media/<item-id>.mp4 --props .cache/video-shorts/<spec id>.props.json --out .cache/video-shorts/frames/<spec id>
```

Open every `*-screen.png` and read its four edges: no word, filter, sidebar item, or button may be cut (a "Perí" where the screen says "Período" is a cut). The pixel scan checks only the start and end boxes and can miss low-contrast text, so this look is required. Also check captions inside the safe area, the right screen in focus, and the screen disclaimer under every product screen. Fix the spec (or recapture the screenshot cropped to the useful area) and render again.

## 4. Credits and manifest

```bash
node <skill-dir>/scripts/credits.mjs --profile docs/ai/social-content.md --voice <voice> --music <track file> [--lang pt-BR]
```

Put the output in the item's `credits` (it is appended to the caption or description). Piper voices always get their license credit; Azure prebuilt voices get none unless the profile has `video.voice_credits.<voice>`, so the output can be only the music line or empty (then leave `credits` null). Add the MP4 to `media` with `kind: "video"`, `width`, `height`, `duration`; set `synthetic_media`, `ai_audio` (true whenever narration was generated; Meta's AI label and LinkedIn's disclosure depend on it), `ai_audio_engine` and `voice` (the next batch alternates from this voice), and `music` (the license entry) from the render output, and `spec` to the spec path. For YouTube, also render a thumbnail with `image-cards` (`yt-thumbnail`); if it is not installed, extract a clear frame of the video as a 1280x720 JPEG (`ffmpeg -ss <t> -i <mp4> -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -frames:v 1 thumb.jpg`) or leave `thumbnail` empty.

## Output

```text
Video: <item-id> <duration> s 1080x1920 (<path>)
Voice: <engine> <voice> | Music: <track or none> | Synthetic media: <yes/no>
Credits: added to <item-id>
```
