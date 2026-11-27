# social-review

Puts a batch up for human review: uploads its media to Google Drive under `<root>/<Platform>/<date>/` with the `drive.file` scope and opens a GitHub issue with a summary table, the full copy, Drive links, and a hidden manifest marker. In adjust mode it reads the reviewers' `/adjust` comments and updates the same issue.

**Requires:** Node.js 22+, `gh`, and a Google OAuth refresh token with the `drive.file` scope (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Mode | `open`, `adjust <issue>` | `open` |
| Batch | manifest path | asks |
| Profile | path | `docs/ai/social-content.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/social-review social/batches/youtube/2026-12-03-youtube/manifest.json` |
| Codex CLI | `$social-review adjust 42` |
| OpenCode | "use the social-review skill to open the review issue" |

## What it does

1. Uploads media, thumbnails, captions, and specs (replacing files in place so links survive) and shares each date folder by link.
2. Opens the issue (label `marketing-content` by default) with the table, the exact text each platform will receive, each item's link with how it is sent and its UTM, and `<!-- social-content-manifest:v1:… -->`.
3. Adjust: restores the batch from the marker and Drive, lists `/adjust` requests from writers only, bumps the revision, re-uploads, updates the body, and comments.

## Side effects

Drive folders and files, a GitHub issue, its body and comments, a label.

Part of the [social content flow](../social-content.md).
