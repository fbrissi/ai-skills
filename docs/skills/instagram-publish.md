# instagram-publish

Deterministic Instagram publisher (Instagram API with Facebook Login): each run uploads the next due item's media to a public S3-compatible bucket (Cloudflare R2), creates the container, waits for it, and publishes, for JPEG photos, carousels, Reels, and Stories, within the 24-hour limit.

**Requires:** Node.js 22+, the Page token and id (`FACEBOOK_*`), and the bucket (`R2_ACCOUNT_ID` or `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Manifest | approved Instagram batch | asks |
| Execute | `--execute` | dry run |
| Items per run | `--max` | 1 |
| Bucket prefix | `--prefix` | `marketing/instagram/{date}/` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/instagram-publish publish the next approved item` |
| Codex CLI | `$instagram-publish dry run` |
| OpenCode | "use the instagram-publish skill for today's post" |

## What it does

1. Picks the next approved, unpublished item whose date has come (plus its `with_stories`).
2. Reads `content_publishing_limit` and stops when the quota is used; uploads media with a SigV4-signed PUT; creates the container, polls `status_code`, and calls `media_publish`.
3. Records the media id, permalink, and public URLs; the next run publishes the next item.

## Side effects

Instagram posts, bucket objects, manifest state.

Part of the [social content flow](../social-content.md).
