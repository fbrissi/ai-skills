# Dependency updates profile

Copy this template to `docs/ai/dependency-updates.md` in your repository and fill it in. Remove the lines you do not need; a missing line uses the first value shown.

```markdown
# Dependency updates

## Scope
- Ecosystems: <npm, composer, github-actions, docker | the ones of the open bot PRs>
- Directories: <ecosystem: path lines, for example `npm: /` | the bot PRs' directories>
- Bots: <dependabot | dependabot, renovate | none>
- Outdated: <none | patch | minor | major>   # also update outdated packages up to this level, not only the bot PRs

## Branch and PR
- Base branch: <main | the delivery profile's Base branch, then the default branch>
- Branch template: <chore/dependency-updates-{date}>
- Labels: <dependencies>

## Never update
- <package>: <reason, for example pinned by the hosting platform>

## Hold
- <package>: <version range to stay in, for example `<19`>; <reason>

## Validation
- Checks: <commands, or empty to use the repository's guide files and CI workflows>
- Extra validation: <commands or manual paths to exercise after every update, for example a build of each app or a payment smoke test>

## Schedule
- <when the bots run and when the combined run starts, for example "Dependabot Monday 09:00 UTC, combined run Monday 12:00 UTC">
```
