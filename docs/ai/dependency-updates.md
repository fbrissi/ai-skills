# Dependency updates

Profile of the [`dependency-updates`](../skills/dependency-updates.md) skill for this repository, run weekly by `.github/workflows/ai-dependency-update.yml`.

## Scope
- Ecosystems: npm
- Directories: npm: /
- Bots: dependabot   # one grouped PR, branch dependabot/dependencies-*, Monday 09:00 America/Sao_Paulo
- Outdated: none

## Branches and PR
- Base branch: main
- Bugfix release branch: base   # no release branches here: every PR into main is a release, so non-urgent updates also go to main (as `bugfix/dependency-updates-<date>`), security ones as `hotfix/dependency-updates-<date>`
- Labels: dependencies

## Never update
- github-actions (`.github/workflows/**`): the agent's App token has no `Workflows` permission, so it cannot push workflow changes; leave those updates in the Dependabot PR for a person (the grouped Dependabot PR is then only partly superseded).

## Hold
- (none)

## Supply chain
- Minimum release age: 3d
- Install scripts: off (`npm ci --ignore-scripts`); `rulesync` needs none
- Secrets: `AGENT_APP_PRIVATE_KEY` and the harness keys only

## Validation
- Checks: `npm ci`, `npm run generate`, `npm run check`, `npm run check:discovery`, `npm run doctor`, and `node scripts/audit-high.mjs npm` (the Quality Checks matrix).
- Extra validation: after a `rulesync` update, `npm run generate` must leave the generated outputs unchanged or the change must be intended and committed; read the Rulesync release notes for the targets in `rulesync.jsonc`.
- Release notes: a new `## vX.Y.Z` section (next patch) at the top of `CHANGELOG.md` and the same version in `package.json` and `plugins/ai-skills/.claude-plugin/plugin.json`, as `AGENTS.md` (Releases) says.

## Schedule
- Dependabot runs Monday 09:00 America/Sao_Paulo (12:00 UTC); this run starts Monday 15:00 UTC.
