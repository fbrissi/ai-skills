# Dependency updates profile

Copy this template to `docs/ai/dependency-updates.md` in your repository and fill it in. Remove the lines you do not need; a missing line uses the first value shown.

```markdown
# Dependency updates

## Scope
- Ecosystems: <npm, composer, github-actions, docker | the ones of the open bot PRs>
- Directories: <ecosystem: path lines, for example `npm: /` | the bot PRs' directories>
- Bots: <dependabot | dependabot, renovate | none>
- Outdated: <none | patch | minor | major>   # also update outdated packages up to this level, not only the bot PRs

## Branches and PR
Branches, the hotfix criteria labels, and the bugfix target come from the delivery profile (`docs/ai/delivery.md`): security updates (high or critical advisory, or the hotfix label) go to `hotfix/dependency-updates-{date}` into the base branch, the rest to `bugfix/dependency-updates-{date}` into the open release branch, opening a release (milestone, release branch, and tracking issue) when there is none, and wait for a later run only when that release branch cannot be created. Repeat a key here only to override it, for example in a repository without release branches or without a delivery profile:
- Bugfix release branch: <base>   # every PR into the base branch is a release here, so bugfixes go to the base branch too
- Open release for bugfixes: <yes | no>   # no: wait for a release branch instead of opening one; set it when delivery-orchestration does not run in this repository
- Labels: <dependencies>
A taken branch name gets `-2`, `-3`. When a reused branch cannot be pushed (for example the base changed workflow files the token cannot push), the run moves to a new branch and PR and closes its own old PR.

## Never update
- <package, ecosystem, or path>: <reason, for example `github-actions` or `.github/workflows/**` when the run's token cannot push workflow files>

## Hold
- <package>: <version range to stay in, for example `<19`>; <reason>

## Supply chain
- Minimum release age: <3d>   # newer versions wait for a later run; also set the bot's `cooldown` (Dependabot) or `minimumReleaseAge` (Renovate)
- Install scripts: <off | on: why the project needs them>
- Secrets: <list only what the run needs; callers pass nothing else>

## Validation
- Checks: <commands, or empty to use the repository's guide files and CI workflows>
- Extra validation: <commands or manual paths to exercise after every update, for example a build of each app or a payment smoke test>

## Schedule
- <when the bots run and when the combined run starts, for example "Dependabot Monday 09:00 UTC, combined run Monday 12:00 UTC">
```
