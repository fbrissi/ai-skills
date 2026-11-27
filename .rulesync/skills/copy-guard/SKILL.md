---
name: copy-guard
description: >-
  Mandatory gate for marketing and social copy before it is published or
  written to a batch manifest: a deterministic checker for AI writing tells,
  engagement bait, unsupported social proof, and result or savings promises,
  plus a detect-only review that names each pattern with a quote and a fix.
  Brazilian Portuguese first, English supported, extendable per project. Use
  when copy, captions, titles, or a social batch must be checked, humanized,
  or approved for AI tells.
---

# Copy guard

Copy passes when the checker reports no errors and the review finds no pattern left. Fix by rewriting; never by deleting facts the reader needs.

## Inputs

- **Target**: a batch manifest (checks every item's final text, title, alt text, and first comment) or a text file or stdin.
- **Language**: the manifest's `language`, `--lang`, or the profile's; `pt-BR` and `en` have rules, other languages get only the universal ones.
- **Profile**: default `docs/ai/social-content.md`; its `copy_guard` parameters add forbidden patterns, disable rules, and cap hashtags and emoji.

## 1. Mechanical check

```bash
node <skill-dir>/scripts/copy-guard.mjs --manifest <batch-dir>/manifest.json --profile docs/ai/social-content.md
node <skill-dir>/scripts/copy-guard.mjs --text <file|-> --lang pt-BR [--platform <name>] [--json]
```

Exit 1 means at least one `ERROR`. Rules (ids in the output): em dash and spaced en dash, emoji or symbol bullets, broetry (three or more one-line sentences in a row), "não é X, é Y" and "not X but Y" contrasts, dramatic hooks and staged reveals, engagement bait (asking for comments, tags, likes, shares), unsupported social proof, fiscal, tax, or savings promises, fear, urgency, or official-endorsement claims ("evite multa", "prazo final", "aprovado pela Receita", "conformidade garantida"), vague attribution ("especialistas", "studies show"), chatbot traces, and the AI vocabulary lists. Hashtags: the profile's `copy_guard.max_hashtags` is a number or a per-platform map (`{"instagram": 5, "default": 3}`); Instagram never allows more than 5. `WARN` lines (AI-typical vocabulary, "único", curly quotes, markdown bold, filler) need a decision: rewrite, or keep when the word is the plain right one.

## 2. Detect-only review

Read the text once more against [references/patterns.md](references/patterns.md) (load it now) for what a regex cannot see: rule of three, synonym cycling, gerund endings that fake analysis, promotional puffery, vague endings, generic sentences that would fit any product (the portability test), and claims without a source in the item's `sources`. Report each finding as `<item>: <pattern> "<quote>" -> <fix in a few words>`. Do not score the text or guess whether AI wrote it.

## 3. Fix and repeat

Rewrite only the flagged sentences, keep the meaning and every sourced fact, and keep the project's voice from the profile. Run step 1 again until it exits 0 and step 2 finds nothing. When the guard runs inside an agent, the manifest is written only after this passes.

## Output

```text
Copy guard: <PASS | FAIL>
Checker: <n> error(s), <n> warning(s) kept (<rule: why>)
Review: <item>: <pattern> "<quote>" -> <fix>   (or "no patterns")
```

Credits: the review patterns adapt `humanizer-pt-br` by mackswendhell and the detect mode of `no-ai-slop` by Peter Yang (both MIT); see the repository NOTICE.
