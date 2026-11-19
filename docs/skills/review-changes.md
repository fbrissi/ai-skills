# review-changes

High-signal code review with a 1-5 star grade and severity-ranked findings. Works on uncommitted changes, a branch, or a PR, and can publish a formal PR review. Replaces Kompass `/review` and `/pr/review`.

**Requires:** `git`. For PRs: `gh` and `jq`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Target | `uncommitted`, a base branch, or a PR number/URL | uncommitted changes if any, otherwise branch vs the default base |
| Publish | say "publish" / "post the review" (PR targets only) | not published |
| Focus | free text (e.g. "security", "migrations") | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/review-changes`, `/review-changes main`, `/review-changes 123 and publish` |
| Codex CLI | `$review-changes uncommitted focus on auth` |
| OpenCode | "use the review-changes skill on PR 123 and publish it" |

## What it does

1. Loads the scope: git diff, or `scripts/pr-context.sh` plus a referenced ticket for PRs. If the ticket cannot be loaded (for example a Jira key in CI with no Jira access), it reviews the diff alone and adds a `Ticket: <ref> not loaded` line instead of stopping.
2. Reads the nearest `AGENTS.md`/`CLAUDE.md` (binding criteria) and every changed file in full.
3. Reports only material defects that have a concrete failure mode: correctness, security, contracts, migrations, concurrency, partial updates, stale references.
4. On PRs it skips concerns that are already settled (resolved threads, author-declined items, its own earlier reviews) unless new code reopens them.
5. Publishing: a 5-star result approves the PR (falling back to a ★★★★★ comment if approval fails). Anything lower is submitted as **one** review with every inline comment anchored to the head SHA.
6. Large PRs: a pass that cannot read everything publishes a partial `COMMENT` review with `Covered:` / `Not covered:` lines and never approves. Later passes read only what is still uncovered and count earlier own passes on the same head (or on an earlier head whose diff to the current one was reviewed). When the passes together cover every changed file and no finding remains unresolved, the 5-star result approves.

It never checks out or switches branches.

The last line is always `Published: <review URL | approved | skipped (head already approved) | skipped (no new findings) | not requested>`, so a CI job can tell a deliberate skip from a failure (for example, `grep -q '^Published: skipped'`).

## Side effects

None unless publishing was requested.
