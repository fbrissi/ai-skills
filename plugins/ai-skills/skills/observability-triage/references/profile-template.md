# Observability triage profile

Copy this template to `docs/ai/observability-triage.md` in your repository and fill it in. Keep tokens and other secrets out of it: name the environment variable or tool that holds them instead. Fix automation (branches, severity, resolve label) lives in the delivery profile the `issue-resolver` agent reads.

```markdown
# Observability triage

## Provider
- Tool: <Sentry | Datadog | New Relic | Grafana | CloudWatch | other>
- Access: <MCP server name | CLI | API token env var name>
- Organization / project: <slug>
- Production environment name: <production>

## Releases
- How releases map to commits: <release name = git tag vX.Y.Z | release = commit sha | deploy log at ...>

## Code map and owners
| Area | Paths | Owner |
|---|---|---|
| <API> | <app/api/**> | <@handle> |

## Known noise
- <errors that are expected and how to recognize them>
```
