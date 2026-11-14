# dev

Implements a feature or fix from a request or a ticket: orient, make the smallest complete change, validate. Optionally ships it. Replaces Kompass `/dev` and `/ticket/dev`.

**Requires:** for ticket sources, the provider CLI or MCP (see [tickets](../../shared/references/tickets.md)).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Source | ticket URL/reference/file, or a plain request | the conversation |
| Ship | "and ship it", "open a PR", "end to end" | stop after validation (uncommitted) |
| Guidance | scope, priorities, tradeoffs | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/dev add retry with backoff to the webhook sender`, `/dev #42 and ship it` |
| Codex CLI | `$dev https://gitlab.com/acme/app/-/issues/7` |
| OpenCode | "use the dev skill on ABC-123 and ship it" |

## What it does

1. Loads the ticket and its comments (if any), writes a short brief (goal, constraints, acceptance criteria), and surveys the relevant code and guidance files.
2. Asks only when an ambiguity would change the implementation. Otherwise it states its assumptions.
3. Implements the smallest complete change, with tests where the project has them.
4. Runs project-native validation and stops on failure.
5. When shipping, hands off to [`ship`](ship.md), passing the ticket URL. This replaces `/ticket/dev`.

## Side effects

Code edits. Commits, pushes and a PR only when shipping.
