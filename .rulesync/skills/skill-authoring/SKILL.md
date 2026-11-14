---
name: skill-authoring
description: >-
  Create a new Agent Skill or improve an existing one (triggering, output
  quality, size) from repo context and real feedback. Works with Rulesync
  sources and native harness skill folders. Use when the user asks to create,
  write, add, optimize, fix, or review a skill or SKILL.md.
---

# Skill authoring

One skill does one reusable job. Prefer the smallest version that works.

## Inputs

- **Mode**: `create` (new skill) or `optimize` (existing skill path or name). Inferred from the request.
- **Direction**: the job, domain, desired name, and sources (files, URLs, tickets, examples).
- **Evidence** (optimize): failing prompts, transcripts, reviewer feedback, evals, or a stated focus (triggering, output quality, bloat).

If you cannot tell what the skill is for, stop and ask for direction.

## 1. Locate the skill root

In order: `.rulesync/skills/` if `rulesync.jsonc` exists (never edit the generated copies) → the repo's existing skill folder (`.agents/skills`, `.claude/skills`, `.opencode/skills`, `.cursor/skills`, `.github/skills`) → `.agents/skills`.

Check existing skills before creating. If one already covers the job, stop and report the overlap, or optimize that skill instead.

## 2. Design

- Name: lowercase kebab-case, at most 64 characters, equal to the folder name.
- `description` decides when the skill triggers. Write what it does, then `Use when…` with concrete user phrasings. Keep it third-person and under about 500 characters (hard limit 1024).
- Body: imperative steps, real commands, explicit stop conditions, and an output template. Give one default path; mention alternatives only as escape hatches.
- Keep `SKILL.md` lean (aim for under 200 lines). Move bulk into `references/` (docs loaded on demand, with a stated condition for when to load them), `scripts/` (deterministic work that would otherwise cost tokens or vary between runs), or `assets/` (templates).
- Avoid harness-specific tool names in the body. Use generic wording ("ask the user", "use subagents if available"). Put per-harness settings in frontmatter sections only when needed.
- No placeholder files, empty directories, or secrets.

```md
---
name: <skill-name>
description: >-
  <What it does>. Use when <triggers>.
---

# <Title>

## Inputs
## Steps
## Output
```

## 3. Optimize mode

1. Read the current `SKILL.md` and only the support files relevant to the focus.
2. Diagnose against the evidence: did it fail to trigger (fix `description`), wander (add steps or stop conditions), waste tokens (cut prose, add a script), or produce bad output (tighten the output template, add an example)?
3. Make the smallest change that fixes it. Keep what works and do not rename unless asked. If no change is justified, say so.

## 4. Validate

- Frontmatter parses, `name` equals the folder name, and the description is within limits.
- Every relative path the skill mentions exists. Scripts are executable and pass `bash -n` or `shellcheck` when available.
- In a Rulesync repo run `npx rulesync generate` then `npx rulesync generate --check`, plus the repo's own checks (e.g. `npm run check`).

## Output

```text
<Created | Optimized> skill: <name>
Path: <dir>/SKILL.md
Files: <list>
Validation: <results>
```
