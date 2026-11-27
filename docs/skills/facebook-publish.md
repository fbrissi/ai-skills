# facebook-publish

Deterministic Facebook Page publisher for an approved batch: text and link posts, photo and multi-photo posts, and Reels, scheduled through the Graph API within the 10-minute to 30-day window, with idempotent state in the manifest.

**Requires:** Node.js 22+, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, optional `FACEBOOK_GRAPH_VERSION` (default `v24.0`).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Manifest | approved Facebook batch | asks |
| Execute | `--execute` | dry run |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/facebook-publish social/batches/facebook/2026-11-30-facebook/manifest.json` |
| Codex CLI | `$facebook-publish dry run this batch` |
| OpenCode | "use the facebook-publish skill on the approved batch" |

## What it does

1. Validates approval, the window, Reel duration and 9:16, and 30 Reels a day.
2. Posts: `/feed` with `published=false` and `scheduled_publish_time`; photos uploaded unpublished (temporary) and attached; Reels with start, upload, and finish (`video_state=SCHEDULED`).
3. Records each result in the manifest's `state`; a re-run skips what is done. Never prints the token.

## Side effects

Scheduled posts on the Page; manifest state.

Part of the [social content flow](../social-content.md).
