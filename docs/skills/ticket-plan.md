# ticket-plan

Turns a ticket or request into a scoped, repo-grounded plan with implementation and validation checklists. Can optionally save it to the ticket. Replaces Kompass `/ticket/plan` and `/ticket/plan-and-sync`.

**Requires:** for tickets, access to the tracker: `gh`, `glab`, an MCP server, a project tool, or a tracker CLI (see [tickets](../../shared/references/tickets.md)).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Source | ticket reference/URL, file, or a request | the conversation |
| Sync | "sync", "save to the ticket", "create a ticket" | present only |
| Focus | constraints, emphasis | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/ticket-plan #42`, `/ticket-plan ABC-123 and sync it`, `/ticket-plan add SSO login, create a ticket` |
| Codex CLI | `$ticket-plan https://github.com/acme/app/issues/42` |
| OpenCode | "use the ticket-plan skill on #42 and save it to the ticket" |

## What it does

1. Loads the ticket body **and comments**. Constraints set in later comments override the original body.
2. Does light, targeted repo reconnaissance to confirm how things currently behave. It keeps correct technical proposals from the ticket, improves incomplete ones, and flags ones that conflict with the code.
3. Writes a plan sized to the work: Title, Description, Implementation, Validation, and assumptions/risks only when they matter.
4. Sync updates the **same** ticket (or comments when overwriting would lose the author's text), or creates a new one.

## Side effects

None unless sync was requested. It never edits code.
