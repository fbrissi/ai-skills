---
name: instagram-publish
description: >-
  Deterministically publish the next approved item of an Instagram batch with
  the Instagram API with Facebook Login: uploads its media to a public
  S3-compatible bucket (Cloudflare R2), creates the container, waits until it is
  ready, and calls media_publish, for JPEG photos, carousels, Reels, and
  Stories, within the 24-hour publishing limit and with idempotent state.
  Instagram has no scheduling API, so a cron runs it. Use when a scheduled job
  or the user publishes approved Instagram content.
---
# Instagram publish

Each run publishes the next due item (one by default) and records it. The consumer's cron decides when: for example Monday, Wednesday, and Friday at 12:00.

## Inputs

- **Manifest**: an approved Instagram batch with its media in place (`social-review` `fetch`).
- **Env**: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` (Page or user token with `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`), `FACEBOOK_GRAPH_VERSION`, optional `INSTAGRAM_USER_ID` (otherwise read from `/{page-id}?fields=instagram_business_account`), and the bucket: `R2_ACCOUNT_ID` (or `R2_ENDPOINT` for any S3-compatible service), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (public URL of the bucket, for example an R2 custom domain), optional `R2_REGION` (default `auto`), `INSTAGRAM_MEDIA_PREFIX`.

## Run

```bash
node <skill-dir>/scripts/publish-instagram.mjs <batch-dir>/manifest.json             # dry run
node <skill-dir>/scripts/publish-instagram.mjs <batch-dir>/manifest.json --execute
```

Flags: `--max N` (items per run, default 1), `--item <id>` (that item, even if not yet due), `--prefix <template>` (bucket key prefix, default `marketing/instagram/{date}/{id}/`; `{date}` is the item's date, `{id}` its id), `--poll-seconds`, `--timeout-seconds` (container wait, default 5 s and 600 s), `--now <ISO>`.

Due items, in manifest order: not yet published, not a story attached to another item, and with `date` on or before today in the batch time zone (or `publish_at` passed when it is set). Stories named in an item's `with_stories` go out right after it, in the same run; a story that failed is due on its own once its parent is published.

Per item: read `content_publishing_limit` and stop (exit 0) when the 24-hour quota cannot fit the item and its stories; upload each file to `<prefix><file>` with a signed PUT (JPEG `image/jpeg`, video `video/mp4`); create the container (`image_url`; `media_type=REELS` with `video_url` and `share_to_feed`; `media_type=STORIES`; carousel children with `is_carousel_item` then `media_type=CAROUSEL`); poll `status_code` until `FINISHED`; `media_publish`; read the permalink; write `state.<id>` (`published`, media id, permalink, public media URLs). Before `media_publish` it saves the container id with status `unknown`. If the call gets no response, the next run reads that container's `status_code`: `PUBLISHED` marks the item published, `FINISHED` publishes the same container, anything else redoes the item, so a post never goes out twice. Once the container id is saved, any error keeps the item `unknown`, so only the container's status decides what happens next. Other errors stop the run and are recorded as `failed`; the next run retries them first.

## Rules

- The media must be public direct URLs: Drive links do not work. Keep the bucket path public only for this prefix.
- Never publish an unapproved batch, never publish twice (state decides), never print tokens or keys.

## Output

```text
published: <item-id> (<media id>) <permalink>
nothing due | publishing limit reached (<used>/<total> in 24 h): <item-id> waits for the next run
```
