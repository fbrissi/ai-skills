# technical-refinement

Second step of the [delivery flow](../delivery-flow.md). For each issue of a GitHub milestone (or one issue) in `needs-technical-refinement`, writes a `## Technical plan` section with [`ticket-plan`](ticket-plan.md): approach, files and areas, technical choices, tests, validation, and `Depends on #<n>`. Then a cross-issue pass makes the milestone safe to build in parallel: overlapping areas are made disjoint or ordered by an explicit dependency, issues are split or merged when needed, and cycles are rejected. Splits and merges here are for code reasons only and keep every issue in the milestone; business refinement already shaped the issues by deliverable. Attachments listed under `## Attachments` are downloaded and read when the tracker credentials exist. Issues move to `status:needs-review`, or to `status:technical-blocked` with the questions in a blocker comment (`<!-- ai-delivery blocker stage=technical-refinement -->`, then `Blocked: <line>`) listed in the output's `Blocked:` block.

**Requires:** `gh` (authenticated). Optional [delivery profile](../delivery-flow.md#profile) at `docs/ai/delivery.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| `milestone` or `issue` | GitHub milestone title or issue number | required (one) |
| `base-branch` | branch | the default branch |
| `output-language` | language of the plans | `English` |
| `status-labels`, `project`, `project-status-field`, `project-status-options` | see [work status](../../shared/references/work-status.md) | `status:<state>`, none, `Status`, Title Case of the state |
| `research-sources`, `context` | URLs or paths; free text | none |
| `requested-by` | GitHub login of the person who started the flow | the milestone's `requested-by` marker |
| `profile` | path | `docs/ai/delivery.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/technical-refinement milestone JIRA:ABC-123` |
| Codex CLI | `$technical-refinement issue 42` |
| OpenCode | "use the technical-refinement skill on milestone Sprint 4" |

## Side effects

Issue bodies (only the `## Technical plan` section, plus `Depends on` lines), splits and merges with linking comments, revised triage fields (Size, Estimate, Effort, dates), labels, and Project status. No code changes.
