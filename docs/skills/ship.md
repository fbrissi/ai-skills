# ship

Branch → commit → push → PR in one pass. Steps that are already done are skipped, so re-running is safe. Replaces Kompass `/ship` and `/ship/inline`.

**Requires:** `git`, `gh`/`glab`. Works best with [`pr-create`](pr-create.md) installed.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Base | branch name | the remote default branch |
| Ticket | reference, `auto`, `skip` | asked during the PR step |
| Guidance | branch naming hints, PR context | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/ship`, `/ship #42`, `/ship base release/v1.2, call the branch bugfix/login-timeout` |
| Codex CLI | `$ship skip ticket` |
| OpenCode | "use the ship skill and link ABC-123" |

## What it does

1. Loads the state once: current branch, uncommitted changes, commits ahead of base.
2. If you are on the base or a protected branch, creates `<type>/<slug>` (following the repo's branch convention if it has one).
3. Commits uncommitted work following the repo's commit convention (Conventional Commits otherwise). Asks if unrelated changes are mixed in.
4. Hands off to `pr-create`, or uses a built-in push and `gh pr create` fallback.

## Side effects

Creates a branch, commits, pushes, opens a PR.
