---
name: social-content-plan
description: >-
  Plan the next batch of organic social posts for Facebook, Instagram, or
  YouTube from the project's social profile: dated slots from its days, times,
  time zone, blackout dates, and calendar hooks, then one brief per slot built
  only from claims the profile sources support, and a skeleton batch manifest.
  Use when an agent, a scheduled job, or the user asks to plan, prepare, or
  start next week's social posts, Reels, or Shorts.
---
# Social content plan

Turn the profile into a dated, fact-checked plan and a skeleton manifest. Never invent facts: every claim comes from the profile or a source it lists.

## Inputs

- **Platform**: `facebook`, `instagram`, or `youtube`.
- **Profile**: default `docs/ai/social-content.md`. Without it, stop: in a non-interactive run say which file is missing and that [references/social-profile-template.md](references/social-profile-template.md) is the template; interactively, offer to create it from the template with the user's answers.
- **Window**: start date (default the Monday after today in the profile time zone) and length (default 7 days).
- **Batch directory**: default `<batches_dir>/<platform>/<publication date>-<platform>` (`batches_dir` from the profile, default `social/batches`).

## 1. Slots

```bash
node <skill-dir>/scripts/plan-slots.mjs --profile docs/ai/social-content.md --platform <platform> [--start YYYY-MM-DD] [--days 7] --init <batch-dir>
```

It prints JSON with `slots` (date, time, `publish_at` with offset; `null` on Instagram), `skipped` (blackout dates and holidays the profile lists), `hooks` (calendar hooks in the window, with sources), `defaults` (scheduled, visibility, formats, images, video), and `warnings`, and writes `<batch-dir>/manifest.json` with one empty item per slot. It refuses to overwrite an existing manifest: adjust that batch instead. No slots means nothing to plan; report it and stop.

## 2. Briefs

Read the profile's Audience, Goal, Offer, Allowed claims, Forbidden claims, Sources, and Voice sections, and the previous four batches of the same platform when they exist (avoid repeating a theme, an opening line, or an image from them).

For each slot, write a brief before any copy:

- **Theme** (kebab-case, used in the UTM campaign) and the reader's problem it speaks to.
- **Claims** it will make, each with its source from the profile. A claim without a source is dropped, not softened. Read the source file or URL to confirm it says what the claim says.
- **Hook** when the slot's date has a calendar hook; cite the hook's source.
- **Format** from `defaults.formats` (rotate; at most one offer-led item per batch unless the profile says otherwise) and the **media** it needs: a card from `image-cards`, a short from `video-shorts`, or none.
- **Link** to a `site_domains` page with the profile UTM (`utm_source`, `utm_medium`, `utm_campaign`), the UTM before any `#anchor`.

Never use: numbers, testimonials, customers, savings, results, or "the only" unless the profile lists them as allowed claims with a source; a fake product screen; personal or customer data.

## 3. Hand off

Record each brief in the item: `id` (`<date>-<theme>`), `type`, `sources`, `link`, and a `notes` line with the brief. The caller (an agent or the user) then writes the copy, creates the media, and runs the `copy-guard` skill. If `copy-guard` is not installed, run its rules by hand: no em dashes, no broetry, no emoji bullets, no engagement bait, no "it's not X, it's Y", no unsupported social proof, no result or savings promises.

## Output

```text
Plan: <platform> <window start>..<end> (<time zone>)
| Date | Time | Type | Theme | Claims (sources) | Media |
|---|---|---|---|---|---|
Skipped: <date: reason>
Hooks used: <date: hook (source)>
Manifest: <batch-dir>/manifest.json
```
