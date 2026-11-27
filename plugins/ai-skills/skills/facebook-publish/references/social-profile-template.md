# Social content profile

Copy this template to `docs/ai/social-content.md` in your repository and fill it in. Every social content skill and agent reads it (`social-content-plan`, `copy-guard`, `image-cards`, `video-shorts`, `social-review`, the publishers, and the `facebook-content`, `instagram-content`, and `youtube-content` agents). The prose sections are the context for writing; the JSON block under `## Parameters` is read by the scripts, so keep it valid JSON.

Facts in this file are the only claims the agents may make. Anything not here, or not in a source listed here, is not said.

````markdown
# Social content: <Project>

## Audience
<who reads the posts: segments, their problem, the words they use>

## Goal
<what a post should make the reader do: visit, sign up, learn; one primary goal>

## Offer
<the current offer, with dates and conditions, and its source; or "none">

## Allowed claims
Each claim with its source (a file path in this repository or a URL). Agents use only these.
- <claim> (source: <path or URL>)

## Forbidden claims
- <for example: numbers of customers, testimonials, savings, "the only", results the product does not guarantee>

## Sources
Files and URLs agents may read for facts and for screenshots: <paths, URLs>.
Real product screens for images and videos: <folder of screenshots or recordings with fictitious data, and how to capture new ones>. Never generate product UIs with AI.

## Calendar hooks
Dated events worth a post, each with its source (they also go in Parameters):
- <YYYY-MM-DD>: <hook> (source: <URL>)

## Voice and style
<tone, person (você/tu, we/I), words to prefer and avoid, pronunciation notes for narration ("say" spellings)>

## Parameters

```json
{
  "project": "<Project>",
  "language": "pt-BR",
  "timezone": "America/Sao_Paulo",
  "batches_dir": "social/batches",
  "site_domains": ["example.com"],
  "utm": { "source": "{platform}", "medium": "social", "campaign": "organic-{theme}" },
  "blackout_dates": [{ "date": "2026-12-25", "reason": "Natal" }],
  "calendar_hooks": [{ "date": "2026-12-01", "hook": "<hook>", "source": "<URL>" }],
  "brand": {
    "colors": { "background": "#f5f7fa", "ink": "#14213d", "primary": "#2d5bab", "on_primary": "#ffffff", "accent": "#2a7d45", "muted": "#4a5d78" },
    "font": { "family": "<Brand Sans>", "files": [{ "path": "<path/to/font.woff2>", "weight": "100 900" }] },
    "logo": "<path/to/logo.svg>",
    "footer": "example.com"
  },
  "copy_guard": {
    "forbidden": [{ "pattern": "\\b<TERM>\\b", "reason": "<why and what to say instead>" }],
    "disable": [],
    "max_hashtags": { "instagram": 5, "default": 3 },
    "max_emoji": 3,
    "allowed_numbers": []
  },
  "review": {
    "label": "marketing-content",
    "drive_root": "<Project>",
    "drive_share": true,
    "commands": { "adjust": "/adjust", "approve": "/aprove" }
  },
  "platforms": {
    "facebook": { "enabled": true, "days": ["mon", "tue", "wed", "thu", "fri"], "times": ["12:30"], "per_batch": 5, "scheduled": true, "visibility": "public", "formats": ["photo", "post"], "images": true, "video": false },
    "instagram": { "enabled": true, "days": ["mon", "wed", "fri"], "times": ["12:00"], "per_batch": 3, "formats": ["photo", "carousel"], "images": true, "video": false, "stories_with_feed": false, "media_prefix": "marketing/instagram/{date}/{id}/" },
    "youtube": { "enabled": true, "days": ["thu"], "times": ["18:00"], "per_batch": 1, "scheduled": true, "visibility": "public", "formats": ["short"], "video": true, "category_id": "28", "playlist_id": null, "made_for_kids": false, "paid_product_placement": false },
    "linkedin": { "enabled": false, "days": ["tue", "thu"], "times": ["09:00"], "per_batch": 2, "formats": ["photo", "post"], "images": true, "video": false, "ai_disclosure": null }
  },
  "video": {
    "voice": "pt_BR-faber-medium",
    "length_scale": 0.92,
    "music": {
      "drive_folder_id": "<Drive folder id with the tracks>",
      "tracks": [{ "file": "city-sunshine.mp3", "title": "City Sunshine", "author": "Kevin MacLeod", "source": "FreePD", "license": "CC0", "license_url": "<URL of the license or the track page>", "evidence": "<Drive file id of the saved license page or receipt>", "sha256": "<sha256 of the mp3: shasum -a 256 city-sunshine.mp3>" }]
    },
    "footnote": "<for example: Telas reais com dados fictícios>",
    "screen_disclaimer": "<required line under every product screen, or omit; for example: Alíquotas e tributação: informadas por você ou pelo seu contador.>"
  }
}
```
````

## Field notes

- `utm`: `{platform}` and `{theme}` are filled per item; every link to a `site_domains` host carries `utm_source`, `utm_medium`, and `utm_campaign`, with the UTM before any `#anchor`.
- `blackout_dates` and `calendar_hooks`: list holidays and events yourself; nothing is assumed from a calendar library.
- `platforms.<p>.days`: `mon`…`sun`; `times`: `HH:MM` in `timezone`; `per_batch`: most items per batch; `formats`: item types to rotate.
- `platforms.instagram` and `platforms.linkedin`: always published by the consumer's cron (no scheduling APIs). Keep `linkedin.enabled` false until LinkedIn approves the Community Management API for your app. `media_prefix` is the bucket key prefix (`{date}`, `{id}`).
- `video.music.drive_folder_id`: a Drive folder whose tracks the app can see (uploaded with `drive.mjs upload`, since the `drive.file` scope only sees app-created files), or a public folder read with `GOOGLE_API_KEY`. Every track used must be listed in `tracks` with its license, `license_url`, `evidence` (Drive file id of the license evidence) and `sha256`; `video-shorts` refuses a track without them or whose file hash differs, and the review issue links the evidence.
- `copy_guard.allowed_numbers`: numeric claims allowed besides those in Offer, Allowed claims, and Calendar hooks, written with the word that follows the number (`"50 números"`); a bare `"30"` allows the number in any context. `copy-guard` flags every other number in digits.
- `video.screen_disclaimer`: a line `video-shorts` draws under every product screen (screenshots and real recordings), at most 80 characters; the render stops when a product screen lacks it. `video.footnote` is the small line near the bottom of screen scenes when the spec has none.
- `video.voice_credits.<voice>.<pt|en>`: credit text for a Piper voice other than `pt_BR-faber-medium`.
