# ai-skills

Public library of reusable, harness-agnostic AI agent skills, plus Claude Code and OpenCode agents built on them. Users install the skills with the `skills` CLI (`npx skills add fbrissi/ai-skills`), which discovers `.rulesync/skills/`, or skills and agents together as the `ai-skills` Claude Code plugin. Rulesync generates the harness folders for local development and the plugin.

## Source of truth

- Edit only `.rulesync/**`, `shared/**`, `docs/**`, `scripts/**`, `.github/workflows/**`, and the root files (`README.md`, `CHANGELOG.md`, `package.json`, configs).
- Generated and committed, never edit by hand: `AGENTS.md`, `CLAUDE.md`. Edit `.rulesync/rules/overview.md`, then run `npm run generate` and commit both.
- Generated and committed, never edit by hand: `plugins/ai-skills/agents/`, `plugins/ai-skills/skills/`, and `plugins/ai-skills/opencode/agent/` (copied from `.opencode/agents/` by `scripts/copy-opencode-agents.sh`, part of `npm run generate`). Hand-written and committed: `plugins/ai-skills/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- Generated and gitignored, never edit or commit: `.claude/`, `.agents/`, `.cursor/`, `.opencode/`, `.github/skills/`, `.github/copilot-instructions.md`. Committed skill folders would make the `skills` CLI list each skill twice.
- Skills live in `.rulesync/skills/<skill-name>/SKILL.md`.
- Files under a skill's `references/` or `scripts/` that are listed in `shared/manifest.txt` are copies: edit `shared/`, then run `npm run sync`.
- To add a skill, follow the `skill-authoring` skill, then add `docs/skills/<name>.md`, a row in the `docs/README.md` catalog, and an entry in the root `README.md` skills table.
- Agents live in `.rulesync/subagents/<name>.md` with `targets: ["claudecode", "claudecode-plugin", "opencodev1"]` and an `opencodev1` section (`mode: all`; `permission: {edit: deny}` when the agent may not write files). To add one, document it in `docs/claude-code-agents.md` and the root `README.md` agents table.

## Commands

Require Node.js 22.22+ and bash.

- `npm run generate`: sync shared files and regenerate outputs
- `npm run check`: fail if shared copies (content, exec bit, orphans) or generated outputs are stale
- `npm run check:discovery`: fail if the `skills` CLI does not find every skill
- `npm run doctor`: diagnose the Rulesync config
- `npm run generate:global`: dev preview into `~/.claude/skills` and `~/.agents/skills`; `rulesync.global.jsonc` must keep `delete: false`. Do not mix with `npx skills add -g`.

## Releases

- Every PR into `main` adds one new `## vX.Y.Z` section at the top of `CHANGELOG.md` and bumps `package.json` `version` to match, and `plugins/ai-skills/.claude-plugin/plugin.json` `version` too (`npm run check` enforces it). CI enforces it; merging tags and releases that version.

## Conventions

- Skill frontmatter has only `name` (equal to the folder, kebab-case) and `description` ("what it does. Use when…"). Do not add Rulesync's `targets` key to skills.
- Keep skills harness-agnostic: no harness tool names in the body.
- Skills that hand off to other skills must include a fallback for when the other skill is not installed.
- Skill scripts are run by absolute path from the user's repository root.
- Project-specific values go in a profile file in the user's repository (default `docs/ai/<skill>.md`), never in the skill. Ship `references/profile-template.md` and ask for missing values when there is no profile.
- Write skill content in English.
- Agents are thin: role, tool limits, and model in frontmatter; the body names the skills to follow, with a fallback when one is not installed, and never duplicates a skill's method. Claude-specific settings go in the `claudecode` section and OpenCode ones in `opencodev1`; leave `model` unset for OpenCode; the body stays harness-agnostic.
- Agents that delegate (orchestrators) must also work when they cannot start subagents, by playing the roles one at a time.
- Agents that merge must keep auto-merge off by default, require a human approval, and decide through the `merge-risk` skill.
