# social-content-plan

Plans the next batch of organic posts for Facebook, Instagram, or YouTube from the project's social profile: dated slots, briefs built only from sourced claims, and a skeleton batch manifest.

**Requires:** Node.js 22+ and a [social profile](../social-content.md#profile) at `docs/ai/social-content.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Platform | `facebook`, `instagram`, `youtube` | asks |
| Window | start date, days | the Monday after today, 7 days |
| Profile | path | `docs/ai/social-content.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/social-content-plan instagram next week` |
| Codex CLI | `$social-content-plan youtube from 2026-12-07` |
| OpenCode | "use the social-content-plan skill for the Facebook batch" |

## What it does

1. Runs `scripts/plan-slots.mjs` to turn days, times, time zone, blackout dates, and calendar hooks into dated slots (`publish_at` with offset; `null` on Instagram) and writes a skeleton `manifest.json`.
2. Writes one brief per slot: theme, claims with their sources, hook, format, media, and a link with the profile UTM. Claims without a source are dropped.
3. Adds a creative brief per item (insight in the audience's words, single-minded message, pillar, angle, scene, proof, call to action) from the profile's Brand section, spreading angles and closings across the batch.
4. Hands off to the copy (written from the creative brief with `references/creative-method.md`), media, and `copy-guard` steps.

## Side effects

Writes the batch directory and its skeleton manifest.

Part of the [social content flow](../social-content.md).
