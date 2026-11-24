# pr-fix

Triage PR review feedback and failing CI, fix what is valid, push, and reply to each item with the fix, a reasoned disagreement, or a clarification question. Replaces Kompass `/pr/fix` and `/pr/fix/loop`.

**Requires:** `gh` (authenticated), `jq`. On GitLab, `glab` (no helper script; the skill falls back to `glab mr view --comments`).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| PR | number or URL | PR of the current branch |
| Mode | `review` (asks before pushing/replying), `auto` (no approval, one pass, no waiting; suits event-driven runs), `loop` (auto + watch CI and new comments) | `review` |
| Pass limit | e.g. "max 3 passes" (loop only) | 5 |
| Guidance | free text | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/pr-fix`, `/pr-fix 123 auto`, `/pr-fix 123 loop only the CI failures` |
| Codex CLI | `$pr-fix 123 loop` |
| OpenCode | "use the pr-fix skill on PR 123 in loop mode" |
| Any (automatic) | "address the review comments on my PR" |

## What it does

1. Loads the whole PR in one call: `scripts/pr-context.sh` returns metadata, failing checks, reviews, comments and **unresolved** threads.
2. Checks out the PR branch and merges the latest base if it is behind (never rebases or force-pushes).
3. Reads the failing CI logs, then classifies each item as `actionable`, `already-addressed`, `superseded`, `disputed` or `needs-clarification`. Project members and the PR author carry more weight on intent; bot claims must be proven in code.
4. Fixes the actionable items, then runs the relevant tests/lint/typecheck. Stops if they fail.
5. In `review` mode it shows a summary and waits for your approval.
6. Commits, pushes, replies inline on review threads, and posts one aggregated comment for everything else.
7. In `loop` mode it repeats: `gh pr checks --watch`, then loads only new activity (`--since`), until clean, waiting on clarification, out of passes, or no longer making progress.

## Side effects

Commits, pushes, and posts PR replies. It never resolves threads unless you ask.
