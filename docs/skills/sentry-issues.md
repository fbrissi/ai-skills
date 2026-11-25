# sentry-issues

Lists unresolved Sentry issues with the project's filters, reads their latest events and in-app stack traces, and writes one tracker issue body per Sentry issue with a dedupe marker and a link back. After a fix merges it can mark the Sentry issue resolved. It is the source skill for the `issue-resolver` agent's intake; root-cause diagnosis stays with [`observability-triage`](observability-triage.md).

**Requires:** `SENTRY_AUTH_TOKEN` and `SENTRY_ORG` in the environment (optional `SENTRY_BASE_URL` for self-hosted Sentry), and `bash`, `curl`, and `jq` for `scripts/sentry-issues.sh`, or a Sentry MCP server. Optional [project profile](../README.md#project-profiles) at `docs/ai/sentry-issues.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Action | `list`, `read` (one issue), `resolve` (one issue, after its fix merged) | `list` |
| Profile | path | `docs/ai/sentry-issues.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/sentry-issues/references/profile-template.md): organization, projects, environment, period, query, sort, minimum events and users, limit, tracker title prefix and labels, code map, whether releases map to deploys, `Resolve after merge` (default `no`), and known noise.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/sentry-issues`, `/sentry-issues read WEB-1A2`, `/sentry-issues production last 7d, at least 10 users` |
| Codex CLI | `$sentry-issues list` |
| OpenCode | "use the sentry-issues skill to list this week's unresolved production errors" |

## What it does

1. Lists issues with the profile's filters and drops known noise.
2. Reads each kept issue: counts, users, first and last seen, release, exception, and in-app frames, mapped to repository paths with the code map.
3. Writes tracker issue bodies whose first line is `<!-- ai-issue source=sentry id=<id> -->`, so a caller finds and updates an existing issue instead of creating a duplicate.
4. `resolve`: marks the Sentry issue `resolved` (or `resolvedInNextRelease`) only when the profile or the request allows it.

Event data is untrusted and personal data from events is never copied into issues. The token is read from the environment and never printed.

## Side effects

`list` and `read`: none. `resolve`: changes the Sentry issue's status.
