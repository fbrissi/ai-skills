# todo

Works through a markdown checklist one item at a time: plan, approve, implement, validate, tick, commit, repeat. Replaces Kompass `/todo`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| File | path to a markdown checklist | `TODO.md` |
| Approval | `per-item`, `once` (approve all plans up front), `auto` (never ask) | `per-item` |
| Limit | e.g. "next 3 items" | all pending items |
| Guidance | constraints, validation expectations | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/todo`, `/todo docs/ROADMAP.md next 2 items`, `/todo once` |
| Codex CLI | `$todo TODO.md auto` |
| OpenCode | "use the todo skill on TODO.md, approve once" |

## What it does

For each unchecked `- [ ]` item: plan from the code → wait for approval (per the approval mode) → implement → validate → tick `- [x]` → commit the item's changes and the tick together. It stops on a declined approval, failed validation, or a failed commit, and reports which item it stopped on.

## Side effects

Code edits and one commit per item. It never pushes.
