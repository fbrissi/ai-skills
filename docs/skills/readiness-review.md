# readiness-review

Third step of the [delivery flow](../delivery-flow.md). An independent gate: for each issue in `needs-review`, checks the business sections (testable acceptance criteria, no open questions), the technical plan (covers every criterion, matches the code, fits one PR), and the dependencies (exist, no cycle, no overlap with an issue it does not depend on), and the triage fields the profile requires. Each issue moves to `status:ready`, back to `status:needs-business-refinement`, or back to `status:needs-technical-refinement`, with a short reason comment. It never edits the issue body.

**Requires:** `gh` (authenticated). Optional [delivery profile](../delivery-flow.md#profile) at `docs/ai/delivery.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| `milestone` or `issue` | GitHub milestone title or issue number | required (one) |
| `output-language` | language of the comments | `English` |
| `status-labels`, `project`, `project-status-field`, `project-status-options` | see [work status](../../shared/references/work-status.md) | `status:<state>`, none, `Status`, Title Case of the state |
| `context` | free text | none |
| `profile` | path | `docs/ai/delivery.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/readiness-review milestone JIRA:ABC-123` |
| Codex CLI | `$readiness-review issue 42` |
| OpenCode | "use the readiness-review skill on milestone Sprint 4" |

## Side effects

Status labels, Project status, and one comment per issue.
