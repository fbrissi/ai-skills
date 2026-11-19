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
| PR | [`pr-checks`](skills/pr-checks.md) | Diagnoses failing PR checks: failing step, real error, cause class, and fix | Fixes only when asked |
| PR | [`review-changes`](skills/review-changes.md) | Graded review of local changes, a branch, or a PR; optional publish | Review only when asked |
| Orchestration | [`dev`](skills/dev.md) | Implements a request or ticket and validates it; optionally ships | Code edits (+ ship) |
| Orchestration | [`ship`](skills/ship.md) | Branch → commit → push → PR | Branch, commit, push, PR |
| Orchestration | [`todo`](skills/todo.md) | Works through a checklist file item by item with approval and commits | Code edits, commits |
| Quality | [`bdd-scenarios`](skills/bdd-scenarios.md) | Maps features and writes Gherkin scenarios with roles, tags, and a coverage matrix | Writes feature files |
| Quality | [`qa-e2e`](skills/qa-e2e.md) | Runs BDD scenarios in a real browser at desktop and mobile viewports; APPROVED or CHANGES REQUIRED | Writes a QA report |
| Quality | [`quality-cycle`](skills/quality-cycle.md) | Review + QA → fixes → re-review and re-test until both approve or a round limit | Local commits, cycle log; push once |
| Brazil | [`inpi-trademark-watch`](skills/inpi-trademark-watch.md) | Analyzes an INPI RPI issue for a watched trademark: actions and deadlines | Writes an issue body file |
| Brazil | [`nfse-technical-note-analysis`](skills/nfse-technical-note-analysis.md) | Maps an NFS-e Nacional technical note to code changes and a rollout plan | Writes an issue body file |
| Media | [`flow-video-ad`](skills/flow-video-ad.md) | Plans a Google Flow ad with real screen footage and assembles the video | Writes files in the ads folder |

How they fit together:

```text
ticket-plan ──► dev ──► ship ──► pr-create ──► pr-fix (loop) ◄── review-changes (publish)
                                                   ▲
                                                pr-checks
                 ▲                                   
ticket-ask   ticket-create   todo   learn   skill-authoring

bdd-scenarios ──► qa-e2e ──┐
                           ├──► quality-cycle ──► dev (fixes) ──► loop until both approve ──► ship / pr-create
review-changes ────────────┘
```

The Brazil and Media skills stand alone and read a project profile.

## Project profiles

Domain skills keep the method in the skill and the project's specifics in a profile: a Markdown file in your repository, by default `docs/ai/<skill>.md`. Pass another path in the request ("profile docs/x.md") to override it. Each of these skills ships `references/profile-template.md` to start from; without a profile, the skill asks for the missing values (or fails clearly in automation).

| Skill | Profile holds |
| --- | --- |
| `inpi-trademark-watch` | the mark, classes, specification, own processes, watch pattern and variants, language, owner |
| `nfse-technical-note-analysis` | scope, documents to read, code map, implementation rules, release facts, language |
| `bdd-scenarios` | features folder, step language, source paths, roles and tags, test data sources, mail catcher, sandboxes |
| `qa-e2e` | URLs, start and reset commands, scenarios folder, test account source, mail catcher, test modes, viewports, report folder |
| `quality-cycle` | round limit, base branch, cycle log folder, checks, triage policy, follow-up tracker, shipping preference |
| `flow-video-ad` | product name and pronunciation, folders, claim sources, forbidden claims, character, voice, setting, crop, end card, privacy rules |

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

- `git`. Also `gh` (authenticated) for GitHub PR/issue skills, `glab` for GitLab, and `bash` + `jq` for `scripts/pr-context.sh` (`pr-fix`, `review-changes`) and `scripts/failed-checks.sh` (`pr-checks`). On Windows, run the harness from Git Bash or WSL for those skills.
- Jira/Linear/other tickets need some access to that tracker: an MCP server or connector, a project or harness tool (for example an OpenCode tool in `.opencode/tools/`), an authenticated CLI, or a public URL. Ticket skills stop without it; `review-changes` continues and notes the missing ticket. See [tickets](../shared/references/tickets.md).
- `qa-e2e` (and the QA step of `quality-cycle`) needs a browser automation capability in the harness and a running local or staging stack.
- `inpi-trademark-watch` needs Ruby and `unzip` to download RPI issues; `flow-video-ad` needs `ffmpeg` and `whisper-cli` to assemble the video.

## Background

- [Kompass analysis](kompass-analysis.md): which Kompass commands were ported, merged, or dropped, and why.
- [Contributing](contributing.md): repo layout, shared files, and the authoring workflow.
