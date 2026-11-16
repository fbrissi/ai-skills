# ticket-create

Creates a ticket summarizing the current work: uncommitted changes or the commits ahead of a base branch. Replaces Kompass `/ticket/create`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Base | branch name | uncommitted changes if any, otherwise commits ahead of the default branch |
| Guidance | audience, labels, related issues | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/ticket-create`, `/ticket-create main label it tech-debt` |
| Codex CLI | `$ticket-create develop` |
| OpenCode | "use the ticket-create skill for the work on this branch" |

## What it does

Loads the scope, groups it into 2-4 outcome themes (every theme backed by a commit for branch scope), writes the body using the shared format with reviewer-facing validation steps, and creates the ticket assigned to you.

## Side effects

Creates one ticket.
