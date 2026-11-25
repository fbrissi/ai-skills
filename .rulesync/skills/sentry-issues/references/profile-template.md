# Sentry issues profile

Copy this template to `docs/ai/sentry-issues.md` in your repository and fill it in. Keep tokens out of it: the skill reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_BASE_URL` from the environment.

```markdown
# Sentry issues

## Source
- Organization: <slug, or empty to use SENTRY_ORG>
- Projects: <web, api>
- Environment: <production>
- Period: <14d>
- Query: <is:unresolved>
- Sort: <freq | date | new | user>
- Minimum events: <1>
- Minimum users affected: <0>
- Limit: <20>

## Tracker issues
- Title prefix: <Sentry:>
- Labels: <bug>

## Code map
| Sentry project or path prefix | Repository paths |
|---|---|
| <web> | <apps/web/**> |

## Releases
- Releases map to deploys: <yes | no>   # yes: resolve as "resolved in next release"
- Resolve after merge: <no | yes>

## Known noise
- <issues to skip and how to recognize them>
```
