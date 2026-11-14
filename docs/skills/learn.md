# learn

Captures non-obvious learnings from the current session into the right guidance file so future sessions do not relearn them. Replaces Kompass `/learn`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Focus | package, directory, or topic | the whole session |
| Guidance | what to emphasize | none |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/learn`, `/learn packages/api`, `/learn the migration gotchas` |
| Codex CLI | `$learn` |
| OpenCode | "use the learn skill to record what we found about the build" |

## What it does

1. Picks the target files: `AGENTS.md`, otherwise `CLAUDE.md`. In Rulesync repos it edits `.rulesync/rules/*.md`, never the generated files.
2. Keeps only what a future agent would otherwise get wrong: hidden coupling, misleading errors, quirks, undocumented validation steps, decisions.
3. Writes each learning in 1-3 lines at the most specific scope (root, package, or feature), updating existing bullets instead of duplicating them.

## Side effects

Edits guidance files. It changes nothing if there is nothing worth recording.
