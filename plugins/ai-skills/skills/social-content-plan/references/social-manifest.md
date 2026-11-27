# Social content batch manifest

One `manifest.json` describes one batch for one platform. Content agents write it, `social-review` stores it in the review issue, and the publishers read it and record their results in it. The schema is [`social-manifest.schema.json`](social-manifest.schema.json); `scripts/social-manifest.mjs validate` checks the schema plus the platform rules below.

## Batch directory

```text
<batches-dir>/<platform>/<batch_id>/
  manifest.json
  media/            images and videos named in items[].media, thumbnails, caption files
  specs/            generation specs (cards JSON, video JSON) named in items[].spec
```

Every path in the manifest is relative to its directory and must stay inside it. `<batches-dir>` comes from the profile (`batches_dir`, default `social/batches`). The batch directory may be temporary: the review issue marker and Google Drive hold the durable copy, and `review-batch.mjs marker` plus `review-batch.mjs fetch` restore it.

## Top level

| Field | Meaning |
|---|---|
| `schema_version` | `1` |
| `platform` | `facebook`, `instagram`, or `youtube` |
| `batch_id` | `<publication_date>-<platform>`, kebab-case |
| `publication_date` | first planned date (`YYYY-MM-DD`) |
| `timezone`, `language` | IANA zone and `pt-BR`/`en`-style language of the copy |
| `items` | the content, in publication order |
| `approval` | `{status: pending|approved|rejected, by, at, revision}`; only the approval step sets `approved` |
| `review` | `{issue_number, issue_url, revision, drive_root_id, history[]}` |
| `state` | `{<item id>: {status: scheduled|published|failed|unknown|skipped, remote_id, url, publish_at, at, attempts, error, media_urls, extra}}`, written only by publishers. `failed`: the platform refused it (safe to retry). `unknown`: the final publish call got no response, so it may be live; never retried automatically (Instagram resolves it from the saved container) |

## Item

| Field | Meaning |
|---|---|
| `id` | kebab-case, unique in the batch, usually `<date>-<slug>` |
| `type` | `post`, `photo`, `carousel`, `reel` (Facebook); `photo`, `carousel`, `reel`, `story` (Instagram); `short`, `video` (YouTube) |
| `date` | planned date; names the Drive and bucket folders |
| `publish_at` | ISO 8601 with offset, or `null` for "the next publisher run" (Instagram) |
| `scheduled` | `true`: the platform schedules it at `publish_at`; `false`: published when the publisher runs |
| `visibility` | `public`, `private`, `unlisted` (YouTube only; Facebook and Instagram are public) |
| `title` | YouTube title (100 characters, no `<` or `>`); optional elsewhere (Facebook Reel title) |
| `caption` | Facebook and Instagram text |
| `description` | YouTube description |
| `hashtags` | `#Tag` list appended to the text when the text does not already have them |
| `tags` | YouTube tags (500 characters in total) |
| `link` | URL with UTM; Facebook `post` sends it as the link preview, other types append it to the text (not on Instagram, where links do not work) |
| `media` | `[{path, kind: image|video, width, height, duration, alt}]`; `social-manifest.mjs probe` fills sizes and durations |
| `thumbnail` | YouTube custom thumbnail (JPEG or PNG) |
| `credits` | credit lines appended to the text (voice and music licenses) |
| `synthetic_media` | `true` when realistic AI-generated footage is used; YouTube gets `containsSyntheticMedia` |
| `sources` | where each claim came from (profile sources only) |
| `spec` | generation spec of the item, for adjust mode |
| `with_stories` | Instagram: story item ids published in the same run as this item |
| `options` | `playlist_id`, `category_id`, `made_for_kids`, `default_language`, `captions` (file), `captions_language`, `share_to_feed`, `first_comment` |
| `notes` | note for the reviewer |
| `drive` | `{folder_id, folder_url, files: {<path>: {id, url, md5}}}`, written by `social-review` |

The text a publisher sends is `composeText(item, platform)`: the caption (or description), then the link when it applies and is not in the text, then the credits, then the hashtags not already in the text. The review issue shows exactly this text.

## Platform rules

| Platform | Rules |
|---|---|
| Facebook | `post` has no media; `photo` has one image; `carousel` 2 to 10 images; `reel` one MP4, 9:16, 3 to 90 s, at most 30 per day. Scheduled items need `publish_at` between 10 minutes and 30 days ahead when published. |
| Instagram | No scheduling: `scheduled: false`, `publish_at: null` (or a time it must not go out before). JPEG images only, aspect 4:5 to 1.91:1 (stories excepted); `carousel` 2 to 20 items; `reel` one MP4, 9:16, 3 s to 15 min; `story` one image or video (60 s); caption 2,200 characters, 30 hashtags, 20 mentions. Media must be at a public URL: the publisher uploads it to the bucket. The account's 24-hour publishing limit applies. |
| YouTube | One video per item; `short` is vertical or square and at most 180 s. Scheduled items upload as private with `publishAt` and must have `visibility: public` and at least 15 minutes of lead. 100 uploads per day by default. |

## Lifecycle

1. Agent (generate): `plan-slots.mjs --init` writes the skeleton; the agent fills items and media, runs the copy guard, `probe`, and `validate`.
2. `social-review`: uploads media to Drive, opens the issue with the marker. Adjust: `bump`, regenerate the changed items, upload again, update the issue body, comment.
3. Approval (a deterministic workflow, after a `/aprove` comment from a writer): `social-manifest.mjs approve --by <login>`.
4. Publishers: `validate --for-publish`, then publish and record `state`. Re-runs skip done items, retry `failed` ones, and skip `unknown` ones until a person checks the platform and passes `--retry <id>` (Facebook, YouTube).

## Issue marker

The review issue body ends with `<!-- social-content-manifest:v1:<base64(gzip(manifest JSON))> -->` and starts with `<!-- social-content:batch platform=<p> batch=<id> revision=<n> -->`. Revision comments start with `<!-- social-content:revision <n> -->`. The last marker in a text wins. `review-batch.mjs marker <body>` decodes it.
