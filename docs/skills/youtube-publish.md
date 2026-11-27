# youtube-publish

Deterministic YouTube uploader for an approved batch of Shorts or videos: resumable `videos.insert` scheduled as private with `publishAt` or published with the item's visibility, the synthetic media disclosure, and optional thumbnail, playlist, and captions.

**Requires:** Node.js 22+, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, optional `YOUTUBE_DAILY_UPLOAD_LIMIT` (default 100).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Manifest | approved YouTube batch | asks |
| Execute | `--execute` | dry run |
| Daily limit | `--daily-limit` | 100 |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/youtube-publish social/batches/youtube/2026-12-03-youtube/manifest.json` |
| Codex CLI | `$youtube-publish dry run` |
| OpenCode | "use the youtube-publish skill on the approved shorts" |

## What it does

1. Validates approval, titles, description size, Shorts length and orientation, and the scheduling lead.
2. Uploads with `privacyStatus=private` + `publishAt` (or the item's visibility) and `containsSyntheticMedia`, saving state right after the insert so it never uploads twice.
3. Sets the thumbnail, playlist, and captions when the item has them; their failures are warnings.

## Side effects

Videos on the channel; manifest state.

Part of the [social content flow](../social-content.md).
