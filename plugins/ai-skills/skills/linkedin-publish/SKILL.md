---
name: linkedin-publish
description: >-
  Deterministically publish the next approved item of a LinkedIn batch as a
  company Page with the Community Management API: text and link posts, single
  images, multi-image posts, and videos uploaded through the Images and Videos
  APIs, with a read-back duplicate check, a daily call budget, and idempotent
  state. LinkedIn has no scheduling API, so a cron runs it. Use when a scheduled
  job or the user publishes approved LinkedIn content.
---
# LinkedIn publish

Each run publishes the next due item (one by default) and records it. The consumer's cron decides when.

## Inputs

- **Manifest**: an approved LinkedIn batch with its media in place (`social-review` `fetch`).
- **Env**: `LINKEDIN_ORGANIZATION_ID` (the Page's numeric id), `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REFRESH_TOKEN` (the app must have the Community Management API product; scopes `w_organization_social` to post as the Page and `r_organization_social` to read posts back; the token holder is a Page admin). Optional: `LINKEDIN_API_VERSION` (`YYYYMM`, default `202610`; LinkedIn supports each version for about a year) and `LINKEDIN_DAILY_CALLS` (default 500, the Development tier limit per app per day).

Access tokens last 60 days and are refreshed from the refresh token on every run. If LinkedIn returns a new refresh token, the script says so (without the value); update the secret. A refresh token that expired or was revoked fails with `invalid_grant`: re-authorize the app and store the new token.

## Run

```bash
node <skill-dir>/scripts/publish-linkedin.mjs <batch-dir>/manifest.json             # dry run
node <skill-dir>/scripts/publish-linkedin.mjs <batch-dir>/manifest.json --execute
```

Flags: `--max N` (items per run, default 1), `--item <id>` (that item, even if not yet due), `--call-budget N` (calls per run, default 100), `--daily-calls N`, `--poll-seconds`, `--timeout-seconds` (media processing wait, default 5 s and 900 s), `--now <ISO>`.

Due items, in manifest order: not yet published, and with `date` on or before today in the batch time zone (or `publish_at` passed when it is set).

Per item:

| Type | Calls |
|---|---|
| `post` | `POST /rest/posts` with the commentary; a `link` becomes an `article` (source and title) |
| `photo` | `POST /rest/images?action=initializeUpload`, `PUT` the bytes, poll until `AVAILABLE`, then the post with `content.media` (and `altText` from `media.alt`) |
| `carousel` | one image upload per file, then `content.multiImage` (2 to 20 images) |
| `video` | `POST /rest/videos?action=initializeUpload`, `PUT` each part, `finalizeUpload` with the part ETags, poll until `AVAILABLE`, then `content.media` (with `title`) |

The commentary uses LinkedIn's little text format: reserved characters are escaped and `#Tag` words become hashtags. Posts are `PUBLIC`, in the main feed, as `urn:li:organization:<id>`.

Before the final `POST /rest/posts` the item is saved as `unknown` with its media URNs. If that call gets no response (or a 5xx), the next run reads the Page's latest posts and marks the item published when one has the same commentary; otherwise it posts again with the media already uploaded, so a post never goes out twice. A 4xx answer is a refusal and is recorded as `failed`. Errors before the post are `failed` and retried by the next run.

Calls: every request counts, media status polls included, and the client refuses a call once the run budget or the 24-hour limit is reached. Such a budget stop ends the run (exit 0) without counting as a failed attempt: the media already uploaded is kept for the next run, and an `unknown` item stays `unknown`. After a real failure the media is uploaded again from the current files, since it may have been the problem. A run stops (exit 0) before an item whose estimated calls would pass the limit. The 24-hour total adds up the calls recorded in this manifest (`state.<id>.extra.api_calls`, retries included); other batches and tools share the app's limit, so lower `--daily-calls` when they run too.

A `failed` item is retried by the next runs; after 3 failed attempts (`state.<id>.extra.failed_attempts`; checkpoints and budget stops do not count) cron runs skip it (`gave up after 3 failed attempts`) so later items still go out. Fix it and publish it with `--item <id>`.

The read-back only accepts a recent post with the same commentary, created after the attempt's first post (`extra.sent_at`, which later runs never move), and carrying the attempt's media URNs, so an older post with the same text never counts.

## AI disclosure

LinkedIn has no API flag for AI content and shows its C2PA label only for media with Content Credentials. When an item has `ai_audio` or `synthetic_media`, the text gets a plain disclosure (default "Narração com voz sintética (Piper TTS)." in Portuguese, or "(Azure AI Speech)" when `ai_audio_engine` is `azure`; override with `options.ai_disclosure`).

## Rules

- Never publish an unapproved batch, never publish twice (state decides), never print tokens.
- `platforms.linkedin.enabled` stays false in the profile until LinkedIn approves the Community Management API for the app.

## Output

```text
published: <item-id> (<urn>) https://www.linkedin.com/feed/update/<urn>/
nothing due | call budget reached (run <n>/<budget>, 24 h <n>/<limit>): <item-id> waits for the next run
```
