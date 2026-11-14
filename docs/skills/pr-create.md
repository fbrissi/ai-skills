# pr-create

Opens a pull request for the current branch from its committed work. It pushes the branch, resolves or creates the linked ticket, and writes an outcome-focused body. Replaces Kompass `/pr/create` and `/pr/create/inline`.

**Requires:** `git`. Also `gh` (GitHub) or `glab` (GitLab).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Base | branch name | the remote default branch |
| Ticket | reference/URL, `auto` (create one), `skip` | detect from commits/branch, otherwise ask |
| Draft | "as draft" | ready for review |
| Guidance | free text for the description | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/pr-create`, `/pr-create develop #42`, `/pr-create auto draft` |
| Codex CLI | `$pr-create skip` |
| OpenCode | "use the pr-create skill against develop, ticket ABC-123" |

## What it does

1. Checks for blockers: uncommitted changes (asks), on the base branch, nothing ahead of base, or an open PR/MR that already exists (returns its URL; closed or merged PRs do not block).
2. Summarizes **only the commits ahead of base** into 2-4 outcome themes.
3. Resolves the ticket, creating one when `auto`.
4. Pushes (setting the upstream when needed, never force-pushing), then opens the PR with the repo's PR template if there is one, otherwise with `## Ticket / ## Description / ## Checklist`.

## Side effects

Pushes the branch, creates the PR, and possibly a ticket.
