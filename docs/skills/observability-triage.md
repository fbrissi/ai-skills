# observability-triage

Investigates a production error or alert from an observability tool (Sentry, Datadog, New Relic, Grafana, CloudWatch, or logs) down to the root cause. It gathers events and stack traces, correlates them with releases and commits, maps frames to the deployed code, tries to reproduce, classifies the cause, rates confidence, and recommends a fix, a configuration change, or the questions that remain. Read-only.

**Requires:** access to the observability tool: an MCP server or connector, an authenticated CLI, or an API token already in the environment. Optional [project profile](../README.md#project-profiles) at `docs/ai/observability-triage.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Target | issue or alert URL/id, or a query ("top errors in production today") | required |
| Profile | path | `docs/ai/observability-triage.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/observability-triage/references/profile-template.md): provider and access, project and environment, release-to-commit mapping, code map and owners, known noise, and the automation settings the `incident-responder` agent reads.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/observability-triage https://acme.sentry.io/issues/123/` |
| Codex CLI | `$observability-triage top unresolved errors in production in the last 24h` |
| OpenCode | "use the observability-triage skill on this Sentry issue" |

## What it does

1. Finds access to the provider and loads the issue: counts, trend, environments, releases, and a few full events.
2. Correlates the start with releases, commits, deploys, and flag changes.
3. Reads the frames at the deployed commit and checks whether `HEAD` already changed them.
4. Reproduces with a test or locally when feasible.
5. Classifies the cause (`code-defect`, `data`, `configuration`, `dependency`, `noise`, `unknown`) with confidence, and recommends the next step for that class.

Event data is treated as untrusted, and personal data from events is never copied into the report.

## Side effects

None. It does not edit code or change issue state in the tool.
