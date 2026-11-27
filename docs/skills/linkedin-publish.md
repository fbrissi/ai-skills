# linkedin-publish

Deterministic LinkedIn company Page publisher (Community Management API): each run publishes the next due item of an approved batch, with media uploaded through the Images and Videos APIs, a read-back duplicate check, and a daily call budget.

**Requires:** Node.js 22+, `LINKEDIN_ORGANIZATION_ID`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REFRESH_TOKEN` (scopes `w_organization_social`, `r_organization_social`), optional `LINKEDIN_API_VERSION` (default `202610`) and `LINKEDIN_DAILY_CALLS` (default 500).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Manifest | approved LinkedIn batch | asks |
| Execute | `--execute` | dry run |
| Items per run | `--max` | 1 |
| Call budget | `--call-budget`, `--daily-calls` | 100 per run, 500 per 24 h |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/linkedin-publish publish the next approved item` |
| Codex CLI | `$linkedin-publish dry run` |
| OpenCode | "use the linkedin-publish skill for today's post" |

## What it does

1. Picks the next approved, unpublished item whose date has come.
2. Uploads images (`initializeUpload`, `PUT`) or a video (parts with ETags, `finalizeUpload`), waits until they are `AVAILABLE`, and posts as `urn:li:organization:<id>` with the commentary in LinkedIn's little text format; link posts become article cards, multi-image posts use `multiImage`.
3. Adds a plain-text AI disclosure when the item has `ai_audio` or `synthetic_media`.
4. Saves the item as `unknown` before the final post; a lost response is resolved next run by reading the Page's latest posts, so nothing is posted twice.

## Side effects

LinkedIn posts; manifest state.

Part of the [social content flow](../social-content.md).
