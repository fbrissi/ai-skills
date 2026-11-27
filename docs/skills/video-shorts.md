# video-shorts

Makes vertical 9:16 Shorts and Reels with Remotion: Piper narration normalized to −16 LUFS, captions, real screenshots or recordings with pan and zoom, a ducked music bed from the project's Drive folder, an end card, and the voice and music credits for the description.

**Requires:** Node.js 22+, `ffmpeg`/`ffprobe`, Python with `piper-tts`, network for the first studio install and voice download. Optional: Google Drive credentials for the music folder.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Brief | theme, claims, call to action | from the plan |
| Voice | Piper voice id | `pt_BR-faber-medium` |
| Music | track from the profile's Drive folder | none |
| Profile | path | `docs/ai/social-content.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/video-shorts reel about recurring invoices, 25 s` |
| Codex CLI | `$video-shorts redo the short with a shorter hook` |
| OpenCode | "use the video-shorts skill for this week's YouTube Short" |

## What it does

1. Writes a scene spec (hook, screen, footage, statement, CTA); `render.mjs` refuses fake product UIs, missing files, zoom boxes or footage the 1000:720 screen frame would cut, boxes whose frame edges slice UI text (a pixel scan of the screenshot), and a product screen without the profile's `video.screen_disclaimer` when the profile sets it (it draws the line under every product screen; without the key it warns).
2. `voice.mjs` generates one WAV per line with Piper (silence trim, EQ, loudnorm); `render.mjs` renders 1080x1920 H.264 with the bundled studio and normalizes the mix to −16 LUFS.
3. `frames.mjs` extracts the first and last frame of every screen scene, full and cropped to the screen window, to check the edges by eye.
4. `credits.mjs` writes the Piper license chain (CC0 dataset, CC BY 4.0 base model) and the music credit for the description; `synthetic_media` is set when supplied AI footage (Veo) is used.

## Side effects

Writes the MP4 under the batch's `media/` and caches in `.cache/video-shorts/`.

Part of the [social content flow](../social-content.md).
