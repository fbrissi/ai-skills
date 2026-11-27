# image-cards

Renders social image cards from HTML/CSS templates to PNG or JPEG with Chromium (Playwright) in Docker with `--network none`, in the brand's colors and fonts, with real product screenshots.

**Requires:** Docker (or Node.js with `playwright-core` and `CARDS_NO_DOCKER=1`). Brand values from the social profile.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Cards | headline, kicker, lead, highlight, badge, screenshot | from the brief |
| Formats | `ig-portrait`, `ig-square`, `story`, `fb-portrait`, `fb-landscape`, `yt-thumbnail` | per platform |
| Profile | path | `docs/ai/social-content.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/image-cards carousel of 5 slides about bulk issuance` |
| Codex CLI | `$image-cards youtube thumbnail for the recurring invoices short` |
| OpenCode | "use the image-cards skill for this week's Instagram cards" |

## What it does

1. Writes a cards spec (`templates`: headline, statement, slide, thumbnail).
2. Renders 1080x1350, 1080x1080, 1080x1920, 1200x630, and 1280x720 offline, JPEG for Instagram and thumbnails; centers cards without an image with larger type; crops screenshots to a region with `image_focus`; flags overflow, safe-area, font problems, a mostly blank safe area, and screenshots drawn too small to read.
3. Checks each image and records it in the manifest with alt text.

## Side effects

Writes images under the batch's `media/` and a cache in `.cache/image-cards/`.

Part of the [social content flow](../social-content.md).
