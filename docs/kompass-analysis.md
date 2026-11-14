# Kompass → generic skills analysis

Source analyzed: [kompassdev/kompass](https://github.com/kompassdev/kompass), specifically the **compiled** OpenCode commands in `packages/opencode/.opencode/commands/` (27 commands, ~130 KB of prompt), plus the tools (`packages/core/tools/`) and agents (`packages/core/agents/`) they depend on.

## Why the commands are not portable as-is

| Kompass dependency | What it really is | Generic replacement |
| --- | --- | --- |
| `kompass_changes_load` | `git diff`/`git log` wrapper with a temp index for uncommitted changes | Plain `git status` / `git diff --stat` / `git log base..HEAD` in each skill |
| `kompass_pr_load`, `kompass_pr_load_review` | Paginated `gh api` REST + GraphQL calls | `scripts/pr-context.sh`: a **single** GraphQL call, compact JSON, open threads only, bot/user tagging, `--since` for incremental loads |
| `kompass_pr_sync` | `gh pr create/edit/review/comment` + REST review API | Direct `gh` commands, with the review submitted as one `pulls/<n>/reviews` call |
| `kompass_ticket_load`, `kompass_ticket_sync` | `gh issue view/create/edit/comment` (GitHub only) | `references/tickets.md`: GitHub, **GitLab**, tracker MCPs (Jira/Linear), local files, free text |
| `question` tool | OpenCode's interactive prompt | "Use the harness's question tool if it has one, otherwise ask in chat and stop" |
| `agent: worker / reviewer / planner` | OpenCode agent routing | Reviewer and planner guidance folded into the skill bodies |
| `/…/inline` variants | Run in the invoking session instead of a subtask | Not needed: skills always run in the current session |

## Decision per command

| Kompass command | Group | Decision | Generic skill |
| --- | --- | --- | --- |
| `/learn` | Guidelines | **Ported** | [`learn`](skills/learn.md) |
| `/skill/create` | Guidelines | **Merged** | [`skill-authoring`](skills/skill-authoring.md) (create mode) |
| `/skill/optimize` | Guidelines | **Merged** | [`skill-authoring`](skills/skill-authoring.md) (optimize mode) |
| `/ticket/ask` | Ticket | **Ported** | [`ticket-ask`](skills/ticket-ask.md) |
| `/ticket/create` | Ticket | **Ported** | [`ticket-create`](skills/ticket-create.md) |
| `/ticket/plan` | Ticket | **Merged** | [`ticket-plan`](skills/ticket-plan.md) (default: present only) |
| `/ticket/plan-and-sync` | Ticket | **Merged** | [`ticket-plan`](skills/ticket-plan.md) (when asked to sync) |
| `/ticket/dev` | Ticket | **Composed** | [`dev`](skills/dev.md) with a ticket source, then ship |
| `/pr/create`, `/pr/create/inline` | PR | **Ported** (inline dropped) | [`pr-create`](skills/pr-create.md) |
| `/pr/fix` | PR | **Ported** | [`pr-fix`](skills/pr-fix.md) (`review` / `auto` mode) |
| `/pr/fix/loop` | Orchestration | **Merged** | [`pr-fix`](skills/pr-fix.md) (`loop` mode) |
| `/pr/review` | PR | **Merged** | [`review-changes`](skills/review-changes.md) (PR target + publish) |
| `/review` | PR | **Merged** | [`review-changes`](skills/review-changes.md) (local target) |
| `/dev` | Orchestration | **Ported** | [`dev`](skills/dev.md) |
| `/ship`, `/ship/inline` | Orchestration | **Ported** (inline dropped) | [`ship`](skills/ship.md) |
| `/todo` | Orchestration | **Ported** | [`todo`](skills/todo.md) |
| `/ask`, `/branch`, `/commit`, `/commit-and-push`, `/merge`, `/rmslop` (+ inline) | Workflow | **Out of scope** | Covered by `ship` steps or plain harness requests; not in the requested groups |

Result: **18 Kompass commands → 11 skills**, about 33 KB of unique skill text (all `SKILL.md` files plus one copy of each shared reference) vs about 105 KB of compiled prompts for the same commands. Only the relevant skill body loads per invocation, and references load on demand.

## Improvements over the originals

1. **Composition instead of compile-time inlining.** Kompass compiles shared components into every command, so `/ticket/dev` (10.5 KB) repeats the full branch, commit and PR-create text, and the "Analyze And Summarize Changes" block appears twice in the same prompt. Here `dev` hands off to `ship`, and `ship` hands off to `pr-create`, each with a short fallback when the other skill is not installed.
2. **Fewer, cheaper tool calls for PR context.** One GraphQL query returns metadata, failing checks, reviews, comments and threads. Resolved threads are dropped by default, and output is pre-shaped JSON, so the model reads less and re-parses nothing.
3. **CI failures are diagnosed, not guessed.** `pr-fix` reads `gh run view --log-failed` before classifying a failure.
4. **Bounded loop.** `pr-fix` loop mode stops after 5 passes (configurable) or when a pass makes no progress; Kompass loops indefinitely.
5. **One review submission.** `review-changes` posts every inline comment in a single `pulls/<n>/reviews` call with `commit_id`, so the review is atomic and anchored to the reviewed SHA.
6. **Provider-agnostic tickets.** GitHub, GitLab (`glab`), tracker MCPs (Jira, Linear), files and free text. Kompass only supports GitHub issues.
7. **Respects repo conventions first.** Commit messages, branch names and PR bodies follow `AGENTS.md`/`CLAUDE.md`/commitlint/PR templates when present, and fall back to Conventional Commits and the shared body format otherwise.
8. **Safer git.** Explicit staging when the worktree has unrelated changes, no `--no-verify`, no force-push, no empty commits, temp body files cleaned up.
9. **Explicit side-effect gates.** `ticket-plan` syncs only when asked; `review-changes` publishes only when asked; `todo` supports `per-item` / `once` / `auto` approval.
10. **Harness-neutral wording.** No OpenCode tool names; skills say "ask the user" and "use subagents if available", so they behave the same in Claude Code, Codex, OpenCode, Cursor and Copilot.

## What was intentionally dropped

- `/inline` variants: an OpenCode subtask optimization with no equivalent in other harnesses.
- Placeholder bookkeeping (`<handled-feedback-ids>`, `Store X as <y>`): this is template-compiler scaffolding, and modern models track state without it. Kept only where it carries logic, such as the loop checkpoint.
- The fixed "No additional steps are required." terminal line: an OpenCode output convention.
