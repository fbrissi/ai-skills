# business-refinement

First step of the [delivery flow](../delivery-flow.md). Reads a source ticket (Jira, GitHub issue, or GitHub milestone) with its comments, attachments, and images, and decides what this repository must deliver. Clear deliverables become a GitHub milestone (title from `milestone-template`, for example `JIRA:ABC-123`) with one business-level issue each: user story, acceptance criteria, out of scope, and a link to the source, labeled `status:needs-technical-refinement`. Unclear parts become one comment on the source, in the source's language and written for the client, and the source is marked `business-blocked` where the tracker supports it. Re-runs update; they never duplicate.

**Requires:** `gh` (authenticated); access to the source tracker as described in [tickets](../../shared/references/tickets.md) (for Jira over REST: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` in the environment). Optional [delivery profile](../delivery-flow.md#profile) at `docs/ai/delivery.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| `source` | Jira key or URL, GitHub issue, or GitHub milestone | required |
| `source-tracker` | `jira`, `github` | `github` |
| `milestone-template` | template with `{key}` | `{key}` |
| `output-language` | language of the issues | `English` |
| `source-language` | language of comments on the source | `auto` (the source's) |
| `status-labels`, `project`, `project-status-field`, `project-status-options` | see [work status](../../shared/references/work-status.md) | `status:<state>`, none, `Status`, Title Case of the state |
| `research-sources`, `context` | URLs or paths; free text | none |
| `profile` | path | `docs/ai/delivery.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/business-refinement ABC-123 source-tracker jira milestone-template JIRA:{key}` |
| Codex CLI | `$business-refinement https://github.com/acme/app/issues/12` |
| OpenCode | "use the business-refinement skill on milestone Sprint 4" |

## Side effects

A milestone, issues, labels, triage fields (Priority, Size, Estimate, Effort, dates, as the profile names them), and Project status; or one comment and a blocked marker on the source. Nothing when the request is not for this repository.
