# skill-authoring

Creates a new Agent Skill or improves an existing one. Works in Rulesync repos (like this one) and with native harness skill folders. Replaces Kompass `/skill/create` and `/skill/optimize`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Mode | create / optimize | inferred from the request |
| Direction | job, name, sources (files, URLs, tickets) | the conversation |
| Evidence (optimize) | failing prompts, transcripts, feedback, focus | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/skill-authoring create a skill for our release checklist`, `/skill-authoring optimize pr-fix, it doesn't trigger on "address comments"` |
| Codex CLI | `$skill-authoring create a db-migration skill from docs/migrations.md` |
| OpenCode | "use the skill-authoring skill to tighten the todo skill" |

## What it does

1. Finds the skill root: `.rulesync/skills/` when a Rulesync config exists, otherwise the repo's existing skill folder, otherwise `.agents/skills/`. Refuses to create a duplicate of an existing skill.
2. Designs a lean `SKILL.md`: a trigger-focused description, imperative steps, stop conditions, and an output template. Bulk content goes to `references/`, `scripts/`, or `assets/`.
3. In optimize mode it diagnoses from the evidence and makes the smallest fix.
4. Validates the frontmatter, the name/folder match, and the referenced paths, then runs `rulesync generate --check` where applicable.

## Side effects

Edits skill files only.
