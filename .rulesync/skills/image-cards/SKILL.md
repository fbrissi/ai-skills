---
name: image-cards
description: >-
  Render social media image cards from HTML/CSS templates to PNG or JPEG with
  Chromium (Playwright) in Docker with no network: Instagram 4:5, square, and
  Stories 9:16, carousel slides, Facebook 1080x1350 and 1200x630, YouTube
  thumbnails 1280x720, in the project's brand colors and fonts, with real
  product screenshots. Use when a post, carousel, story, or thumbnail needs an
  image, or the user asks for social cards or a thumbnail.
---

# Image cards

Write a cards spec, render it offline, look at every image, fix what is off, and hand the files to the manifest.

## Inputs

- **Cards**: what each image says (headline, optional kicker, lead, highlight, badge) and which real screenshot it shows, if any.
- **Profile**: default `docs/ai/social-content.md`; `brand` gives colors, font files, logo, and footer. Without font files the cards use the system font; say so.
- **Output**: the batch's `media/` directory.

## 1. Spec

Write `<batch-dir>/specs/<item-id>.cards.json` (format in [references/cards-spec.md](references/cards-spec.md); load it now). Formats:

| Format | Size | Type | Use |
|---|---|---|---|
| `ig-portrait` | 1080x1350 | JPEG | Instagram feed and carousel slides (4:5) |
| `ig-square` | 1080x1080 | JPEG | Instagram square |
| `story` | 1080x1920 | JPEG | Instagram and Facebook Stories; text stays out of the top 250 px and bottom 400 px |
| `fb-portrait` | 1080x1350 | PNG | Facebook feed |
| `fb-landscape` | 1200x630 | PNG | Facebook link and landscape posts |
| `yt-thumbnail` | 1280x720 | JPEG | YouTube custom thumbnail |

Instagram accepts only JPEG, so keep the default types. Text on the card follows the `copy-guard` rules too: run its checker on the headlines and leads (`--text -`).

Screens: only real screenshots or frames the project provides (the profile's Sources section), with fictitious data and no personal or customer data. Never draw or generate a fake product UI. Label them ("Tela real · dados fictícios") with `image_label` when the data is fictitious.

## 2. Render

From the repository root:

```bash
bash <skill-dir>/scripts/render.sh --spec <batch-dir>/specs/<item-id>.cards.json --out <batch-dir>/media --profile docs/ai/social-content.md
```

It runs `mcr.microsoft.com/playwright:v1.65.0-noble` with `--network none` (the first run installs `playwright-core` into `.cache/image-cards/` with network; add `.cache/` to `.gitignore`). Without Docker, `CARDS_NO_DOCKER=1` runs a local Node with `playwright-core`. Output: `<out>/<card-id>-<format>.<jpg|png>` and a JSON report on stdout. A `WARN` line (text outside the safe area, overflow, image area too small, font not loaded) makes it exit 1: shorten the copy or change the template, then render again. Pass `--allow-warnings` only for a warning you checked and accept.

## 3. Check and record

Open every rendered image and check it: legible at phone size, nothing cut, the right screenshot, brand colors. Then add each file to the item's `media` (`{path, kind: "image", width, height, alt}`, `alt` describing the image) or `thumbnail`, and set the item's `spec`.

## Output

```text
Cards: <n> rendered (<formats>), <n> warnings accepted
<card-id>-<format>: <path> <width>x<height>
```
