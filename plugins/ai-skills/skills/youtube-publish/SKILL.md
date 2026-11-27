---
name: youtube-publish
description: >-
  Deterministically upload an approved batch of Shorts or videos with the
  YouTube Data API v3: resumable videos.insert scheduled as private with
  publishAt or published with the item's visibility, the synthetic media
  disclosure, and optional custom thumbnail, playlist, and captions, within a
  daily upload limit and with idempotent state. Use when an approved YouTube
  batch must be uploaded or scheduled, or a workflow runs the YouTube publisher.
---
# YouTube publish

Upload, schedule, record. The copy and media are final when this runs.

## Inputs

- **Manifest**: an approved YouTube batch with its media in place (`social-review` `fetch`).
- **Env**: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` (OAuth refresh token of the channel owner with scope `https://www.googleapis.com/auth/youtube.upload`, plus `https://www.googleapis.com/auth/youtube` for playlists and `https://www.googleapis.com/auth/youtube.force-ssl` for captions), optional `YOUTUBE_DAILY_UPLOAD_LIMIT` (default 100).

## Run

```bash
node <skill-dir>/scripts/publish-youtube.mjs <batch-dir>/manifest.json             # dry run
node <skill-dir>/scripts/publish-youtube.mjs <batch-dir>/manifest.json --execute
```

Flags: `--only <item-id>`, `--retry <id,id>` (items left `unknown`, after a manual check), `--daily-limit N`, `--now <ISO>`.

Per item: `videos.insert` (resumable, `part=snippet,status`) with the title, the composed description (description, link, credits, hashtags), tags, `categoryId` (default 22), default language, `selfDeclaredMadeForKids`, and `containsSyntheticMedia` from `synthetic_media`. Scheduled items upload with `privacyStatus=private` and `publishAt` (they go public then); others use the item's visibility. The state (`scheduled`/`published`, video id, Shorts or watch URL) is saved right after the insert, so a re-run never uploads twice. When the upload itself gets no response, the video may exist: the item becomes `unknown` and is skipped (`needs a manual check`) until you check YouTube Studio and rerun with `--retry <id>`. Then, when the item has them: `thumbnails.set` (needs a verified channel), `playlistItems.insert`, `captions.insert`. Their failures are warnings in `state.<id>.extra.warnings`, not a failed upload.

Limits: Shorts are vertical or square and at most 180 s (validated). The run stops (exit 0) when the uploads of the last 24 hours recorded in this manifest reach the daily limit (uploads from other batches or tools on the same project are not counted, so set `--daily-limit` to what is left for this batch), or when the API reports a quota error; the rest waits for the next run.

## Rules

- Never publish an unapproved batch, never print tokens, never delete videos.
- Synthetic media: set `synthetic_media` on the item whenever realistic AI-generated footage is in the video; the publisher declares it.

## Output

```text
<scheduled|published>: <item-id> <private until ...|visibility> <URL> [warnings: ...]
```
