# ai-skills documentation

## Skill catalog

| Group | Skill | What it does | Side effects |
| --- | --- | --- | --- |
| Guidelines | [`learn`](skills/learn.md) | Captures non-obvious session learnings into `AGENTS.md`/`CLAUDE.md` | Edits guidance files |
| Guidelines | [`skill-authoring`](skills/skill-authoring.md) | Creates or optimizes an Agent Skill | Edits skill files |
| Ticket | [`ticket-plan`](skills/ticket-plan.md) | Repo-grounded implementation plan from a ticket/request; optional sync | Ticket update only when asked |
| Ticket | [`ticket-ask`](skills/ticket-ask.md) | Answers a question on a ticket and posts the reply | Posts a ticket comment |
| Ticket | [`ticket-create`](skills/ticket-create.md) | Creates a ticket summarizing current work | Creates a ticket |
| PR | [`pr-create`](skills/pr-create.md) | Pushes the branch and opens a PR with a linked ticket | Push, PR, optional ticket |
| PR | [`pr-fix`](skills/pr-fix.md) | Triages review feedback and CI, fixes, pushes, replies; optional watch loop | Commits, push, PR replies |
| PR | [`review-changes`](skills/review-changes.md) | Graded review of local changes, a branch, or a PR; optional publish | Review only when asked |
| Orchestration | [`dev`](skills/dev.md) | Implements a request or ticket and validates it; optionally ships | Code edits (+ ship) |
| Orchestration | [`ship`](skills/ship.md) | Branch → commit → push → PR | Branch, commit, push, PR |
| Orchestration | [`todo`](skills/todo.md) | Works through a checklist file item by item with approval and commits | Code edits, commits |

How they fit together:

```text
ticket-plan ──► dev ──► ship ──► pr-create ──► pr-fix (loop) ◄── review-changes (publish)
                 ▲                                   
ticket-ask   ticket-create   todo   learn   skill-authoring
```

## Using the skills per harness

Folders below are where `npx skills add` installs (project / user scope).

| Harness | `-a` id | Project folder | User folder | Invoke explicitly | Guide |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` | `/pr-fix 123` | [claude-code.md](harnesses/claude-code.md) |
| Codex CLI | `codex` | `.agents/skills/` | `~/.agents/skills/` | `$pr-fix 123` | [codex-cli.md](harnesses/codex-cli.md) |
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` | "use the pr-fix skill on PR 123" | [opencode.md](harnesses/opencode.md) |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` | `/pr-fix 123` | [cursor.md](harnesses/cursor.md) |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` | `/pr-fix 123` | [github-copilot.md](harnesses/github-copilot.md) |

Most harnesses share `.agents/skills/`, so one project install serves all of them. Each harness page also lists the folders it reads natively and the Rulesync alternative.

Every harness also picks a skill **automatically** when your request matches its description (for example "address the review comments on this PR" triggers `pr-fix`).

## Installing

- **`skills` CLI** (recommended): `npx skills add fbrissi/ai-skills` for the current project, add `-g` for your user, and run `npx skills update` to update. See the [README](../README.md#install).
- **Rulesync projects**: pull the skills as a declarative source, see [install-in-a-project.md](install-in-a-project.md).

## Requirements

- `git`. Also `gh` (authenticated) for GitHub PR/issue skills, `glab` for GitLab, and `bash` + `jq` for `scripts/pr-context.sh` (`pr-fix`, `review-changes`). On Windows, run the harness from Git Bash or WSL for those two skills.
- Jira/Linear tickets need that tracker's MCP server/connector configured in the harness.

## Background

- [Kompass analysis](kompass-analysis.md): which Kompass commands were ported, merged, or dropped, and why.
- [Contributing](contributing.md): repo layout, shared files, and the authoring workflow.
