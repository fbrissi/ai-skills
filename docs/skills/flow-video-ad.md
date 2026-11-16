# flow-video-ad

Plans a short ad or reel made with Google Flow (Veo) plus real screen recordings of your product: verified claims, a shot table, ready-to-paste prompts, and the Flow steps. Then assembles the final 9:16 video from the clips you generate.

**Requires:** a [project profile](../README.md#project-profiles) at `docs/ai/flow-video-ad.md` (or answers to a few questions). For assembly: `ffmpeg`, `ffprobe`, and `whisper-cli`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Feature | one feature per ad | asks |
| Channel | Instagram, TikTok, LinkedIn, WhatsApp | 9:16 |
| Length | seconds | 25–35 s |
| Footage | recording and time range | asks |
| Profile | path | `docs/ai/flow-video-ad.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/flow-video-ad/references/profile-template.md): product name and pronunciation, folders, claim sources, forbidden claims, character, voice, setting, crop, end card, privacy rules.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/flow-video-ad reel about bulk invoice download` |
| Codex CLI | `$flow-video-ad redo ad 03 with a shorter hook` |
| OpenCode | "use the flow-video-ad skill for a LinkedIn promo of the import feature" |

## What it does

1. Collects the brief and checks every product claim in code or docs.
2. Plans short, independent 4–8 s shots, each with at most three actions, a fixed start and end state, one sentence of speech, and a green laptop screen for product footage.
3. Writes `<ads-folder>/<NN>-<slug>/ROTEIRO.md` with the claim checks, the shot table, one prompt per shot, and the Flow steps that save credits.
4. When the clips are in `flow/`, transcribes them, keys the green screen with a corner-pin warp, adds the real footage, captions, end card, and music, and renders 1080×1920.

## Side effects

Writes files under the ads folder. Flow generations are done by you.
