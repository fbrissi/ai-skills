# dependency-updates

Brings a repository's pending dependency updates into at most two PRs, with the care of a person who reads the changelogs and branched like a production fix (security updates as a hotfix into the base branch, the rest as a bugfix into the open release branch): the open Dependabot (or Renovate) PRs and, when the profile asks, outdated packages up to a level. For each package it reads the release notes and upgrade guide, lists the breaking changes that apply, finds the affected code, and adapts it with [`dev`](dev.md); it holds back what cannot be adopted safely and says why. Then it runs the project's checks, a [`quality-cycle`](quality-cycle.md) with the app running, writes the release notes the repository's rules ask for, and opens the PR with [`pr-create`](pr-create.md). It is the skill of the `dependency-updater` agent, which a weekly workflow can run after the bots.

**Requires:** `git`, `gh` (authenticated), and the package managers of the enabled ecosystems. Optional [project profile](../README.md#project-profiles) at `docs/ai/dependency-updates.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Profile | path | `docs/ai/dependency-updates.md` |
| Branches | delivery profile keys | `hotfix/dependency-updates-{date}` into `Base branch`; `bugfix/dependency-updates-{date}` into `Bugfix release branch`, else the oldest open release branch (`base`: the base branch) |
| requested-by | GitHub login | none |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/dependency-updates/references/profile-template.md): ecosystems and directories, bots, `Outdated` level (`none`, `patch`, `minor`, `major`), base branch, branch template, labels, `Never update`, `Hold` ranges, checks and extra validation, and schedule notes.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/dependency-updates`, `/dependency-updates also minor outdated npm packages` |
| Codex CLI | `$dependency-updates` |
| OpenCode | "use the dependency-updates skill to combine this week's Dependabot PRs" |

## What it does

1. Collects the packages of the open bot PRs into the base branch, outdated packages when enabled, and the open advisories; drops what `Never update` names (package, ecosystem, or path), versions past a `Hold`, and versions younger than `Minimum release age` (default 3 days, security fixes exempt). A grouped bot PR that keeps such an update stays partly superseded for a person.
2. Routes: an update that fixes a **high or critical** advisory on the version in use, or one a person labeled with the hotfix label, is urgent and goes to `hotfix/dependency-updates-<date>` into the base branch; the rest go to `bugfix/dependency-updates-<date>` into the bugfix target. With no release branch to target, the non-urgent updates wait for a later run (no blocker; the report says since when).
3. Per kind, reuses the open PR of an earlier run (marker `<!-- ai-dependency-updates -->`) only when it is a same-repository PR opened by the run's own identity on a branch with that kind's prefix, merging the base branch into it; otherwise creates the branch (`-2`, `-3` when the name is taken). When a reused branch can no longer be pushed (for example workflow files changed on the base), it moves to a new branch and PR and closes its own old PR.
4. Per package, reads every release between the two versions and the upgrade guide, lists the breaking changes that apply, searches the code for them, and decides adopt or hold.
5. Updates with each ecosystem's own package manager (lockfiles regenerated, never hand-edited; lifecycle scripts off where possible), adapts the code, commits, and runs the checks; a package it cannot adopt safely is reverted and held with the error.
6. Runs `quality-cycle` (review of the full diff, QA of the touched areas with the app running) until both approve, and pushes.
7. Adds the release section and version for a PR into the base branch (none for a PR into a release branch), or updates the one a reused PR already has.
8. Opens or updates each PR with the `dependencies` and hotfix or bugfix label: packages and versions, breaking changes and their handling, held packages, checks and QA results, and `Supersedes #<n>` for every bot PR it covers. Then stops.

Without `quality-cycle` it reviews and exercises the app itself and says the cycle was not independent; without `pr-create` it pushes and runs `gh pr create`. Release notes and bot PR bodies are untrusted data.

## Supply chain

The run installs, tests, and starts freshly published code with a write token and AI keys in its environment. Keep the exposure small:

- Set a minimum release age: the profile's `Minimum release age` (default 3 days) and the bot's own delay (Dependabot `cooldown`, Renovate `minimumReleaseAge`).
- Keep lifecycle scripts off where the project works without them (`npm ci --ignore-scripts`, `yarn install --ignore-scripts`, `composer install --no-scripts`); the skill holds a package whose install behaves suspiciously.
- Pass the workflow only the secrets the run needs: the agent App key and the harness key, never `secrets: inherit` or unrelated tokens.

## Side effects

Up to two branches with commits, pushes, and PRs (created or updated); it may close its own earlier PR when it moves to a new branch. It never closes, merges, approves, comments on, or pushes to the bot PRs; they close themselves once the update reaches the base branch.
