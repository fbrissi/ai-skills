# Install in a project

The simplest way is the `skills` CLI from the project root (see the [README](../README.md#install)):

```bash
npx skills add fbrissi/ai-skills
```

It records the installed skills in `skills-lock.json`. Commit that file and the skill folders so the whole team gets them; `npx skills update` updates them.

- **Pin a release**: `npx skills add fbrissi/ai-skills@v0.1.0` (tags are listed in [Releases](https://github.com/fbrissi/ai-skills/releases) and [CHANGELOG.md](../CHANGELOG.md)). `npx skills check` shows available updates.
- **Committed installs**: by default the CLI symlinks agent folders (for example `.claude/skills/<name>`) to `.agents/skills/<name>`. Teammates on Windows with `core.symlinks=false` get broken links, so add `--copy` for installs you commit.
- **Name clashes**: `dev`, `todo`, `learn` and `ship` are common names. If another pack already uses one, install only the skills you need with `-s <name>`.

## Rulesync sources

Projects that already use Rulesync can consume this library through [declarative sources](https://rulesync.dyoshikawa.com/guide/declarative-sources). The skills are fetched, pinned by commit SHA in `rulesync.lock`, and generated into each harness folder.

### 1. Configure

In the project's `rulesync.jsonc`:

```jsonc
{
  "$schema": "https://github.com/dyoshikawa/rulesync/releases/latest/download/config-schema.json",
  "targets": ["claudecode"],          // only the harnesses this project uses
  "features": ["skills"],
  "sources": [
    // every skill
    { "source": "fbrissi/ai-skills:.rulesync/skills" }
    // or a selection:
    // { "source": "fbrissi/ai-skills:.rulesync/skills", "skills": ["pr-fix", "review-changes", "ship", "pr-create"] }
    // or pinned to a tag/commit:
    // { "source": "fbrissi/ai-skills@v1.0.0:.rulesync/skills" }
  ]
}
```

### 2. Install and generate

```bash
npx rulesync install && npx rulesync generate
```

```bash
npx rulesync gitignore
```

Commit `rulesync.jsonc` and `rulesync.lock`. Fetched skills land in `.rulesync/skills/.curated/` (gitignored). To pick up new versions:

```bash
npx rulesync install --update && npx rulesync generate
```

## Selecting skills

Each skill is self-contained: its scripts and references are copied into it. Some skills hand off to others when those are installed, and fall back to built-in steps when they are not:

| Skill | Hands off to |
| --- | --- |
| `dev` | `ship` (when asked to ship) |
| `ship` | `pr-create` |

## Avoid duplicate skills

Several harnesses read more than one folder:

| Harness | Also reads |
| --- | --- |
| OpenCode | `.claude/skills/`, `.agents/skills/` |
| Cursor | `.agents/skills/` |

**With the `skills` CLI**: when you select Claude Code together with another agent, `.claude/skills/<name>` is a symlink to `.agents/skills/<name>`, so OpenCode may list each skill twice. The content is identical. If you only use OpenCode, do not select `claude-code`.

**With Rulesync**: Rulesync's `opencode` target is not needed: OpenCode picks up the skills from `.claude/skills/` and `.agents/skills/`. Adding it would list each skill once more in OpenCode. Enable only the targets the team actually uses. A common choice for a mixed team is `claudecode` + `codexcli`: OpenCode reads both folders, and Cursor reads `.agents/skills/`.

## Private fork or GitLab mirror

Use the git transport:

```jsonc
{ "source": "https://gitlab.com/<group>/ai-skills.git", "transport": "git", "path": ".rulesync/skills" }
```
