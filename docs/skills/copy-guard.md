# copy-guard

Mandatory gate for marketing copy: a deterministic checker for AI writing tells, engagement bait, unsupported social proof, and result or savings promises, plus a detect-only review that names each remaining pattern with a quote and a fix. Brazilian Portuguese first, English supported.

**Requires:** Node.js 22+. Optional profile `copy_guard` parameters (extra forbidden patterns, disabled rules, hashtag and emoji caps, extra allowed numbers).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Target | manifest, text file, or stdin | asks |
| Language | `pt-BR`, `en` | manifest or profile language |
| Profile | path | `docs/ai/social-content.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/copy-guard social/batches/facebook/2026-11-30-facebook/manifest.json` |
| Codex CLI | `$copy-guard check this caption` |
| OpenCode | "use the copy-guard skill on this post" |

## What it does

1. Runs `scripts/copy-guard.mjs`: em dashes, emoji bullets, broetry, "não é X, é Y" and "not X but Y", dramatic hooks, engagement bait, social proof, fiscal and savings promises, vague attribution, chatbot traces, AI vocabulary, numbers (counts, percentages, amounts, durations) that are not in the profile's Offer, Allowed claims, or Calendar hooks, and relative days ("hoje", "amanhã", "today") in Stories and other items a cron publishes. In a manifest it also checks the text drawn in each item's cards or video spec, and warns when a sentence or opening repeats in three or more items (`repeated-template`). Exit 1 on any error.
2. Reviews what a regex cannot see (rule of three, puffery, portability test, unsourced claims) and reports each finding with a quote and a fix.
3. Repeats until both pass.

## Side effects

None; the caller rewrites the copy.

Part of the [social content flow](../social-content.md).
