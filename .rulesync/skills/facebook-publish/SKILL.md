---
name: facebook-publish
description: >-
  Deterministically schedule or publish an approved social batch on a Facebook
  Page through the official Graph API: text and link posts, photo and
  multi-photo posts (photos uploaded unpublished and attached), and Reels
  (video_state SCHEDULED), within the 10-minute to 30-day scheduling window,
  with idempotent state in the manifest. Use when an approved Facebook batch
  must be scheduled, or a workflow runs the Facebook publisher.
---

# Facebook publish

A script, not a judgment call: it validates, schedules, and records. Never change the copy or the media here.

## Inputs

- **Manifest**: an approved batch (`approval.status: approved`), with its media in place (`social-review` `fetch` restores them from Drive).
- **Env**: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` (a Page token; a user token is exchanged for the Page token through `/{page-id}?fields=access_token`), `FACEBOOK_GRAPH_VERSION` (default `v24.0`). The token needs `pages_manage_posts`, `pages_read_engagement`, and `pages_show_list`.

## Run

```bash
node <skill-dir>/scripts/publish-facebook.mjs <batch-dir>/manifest.json            # dry run: validate and list
node <skill-dir>/scripts/publish-facebook.mjs <batch-dir>/manifest.json --execute  # schedule
```

Flags: `--only <item-id>`, `--retry <id,id>` (items left `unknown`, after a manual check), `--now <ISO>` (tests). What it does per item:

| Type | Graph calls |
|---|---|
| `post` | `POST /{page}/feed` with `message`, `link`, and `published=false`, `scheduled_publish_time`, `unpublished_content_type=SCHEDULED` (or `published=true` when `scheduled` is false) |
| `photo`, `carousel` | `POST /{page}/photos` per image (`published=false`, `temporary=true` when scheduled), then `/feed` with `attached_media[i]` |
| `reel` | `POST /{page}/video_reels` `upload_phase=start`, upload to `rupload.facebook.com`, then `upload_phase=finish` with `video_state=SCHEDULED` and `scheduled_publish_time` (or `PUBLISHED`) |

It checks the batch first (`validate --for-publish`): approval, the 10-minute to 30-day window, Reels 3–90 s and 9:16, at most 30 Reels a day. After each item it writes `state.<id>` (`scheduled`/`published`, the post or video id, URL) to the manifest, so a re-run skips done items and retries failed ones. The first API error stops the run, is recorded as `failed` (the next run retries it), and is printed with the Graph code and without the token. When the final call (`/feed` or the Reel `finish`) gets no response at all, the post may exist: the item becomes `unknown` and every later run skips it with `needs a manual check`. Look in Meta Business Suite > Planner; rerun with `--retry <id>` only if it is not there.

## Policy

- Meta labels AI content: when an item has `ai_audio` (TTS narration) or `synthetic_media` (realistic AI footage), the Reel's `finish` call sends `is_ai_generated=true`.
- Reels schedule up to 29 days ahead; feed posts up to 30 days (validated).
- Right after a Reel upload the script reads its `copyright_check_information` once (the check is often still running then, so no warning is no guarantee); matches (or a failed read) go to `state.<id>.extra.warnings`, never failing the publish. Check them in Meta Business Suite before the Reel goes out.

## Platform setup

- The Meta app must be in Live mode, with App Review approval for the permissions above. Use a system-user Page token (Business Manager > System users), not a user token: it does not expire with a person's session.

## After the run

Persist the updated manifest where the batch lives (the workflow updates the review issue body with `review-batch.mjs issue-body`). Scheduled posts can be edited or deleted in Meta Business Suite > Planner before they go out. Never retry with another token or endpoint after an error; report it.

## Output

```text
<scheduled|published|already ...>: <item-id> at <publish_at> (<id>)
```
