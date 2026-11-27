# Delivery inputs and profile

One profile serves the whole delivery flow: `business-refinement`, `technical-refinement`, `readiness-review`, and `delivery-orchestration`, and the agents and skills that create branches (`issue-resolver`, `milestone-delivery`, `dependency-updates`).

## Resolving values

For every value: the run's input (from the request, a calling agent, or a workflow input) wins, then the profile (`profile`, default `docs/ai/delivery.md`), then the default below. Without a profile, use the defaults and say so once in the output.

| Input | Profile line | Default |
| --- | --- | --- |
| `source` | n/a | required by business refinement |
| `source-tracker` | Source tracker | `github` (`jira` or `github`) |
| `milestone` / `issue` | n/a | required by the later steps (one of them) |
| `branch` | n/a | set by orchestration |
| `base-branch` | Base branch | the repository's default branch |
| `release-branch-template` | Release branch template | `release/{slug}` |
| `feature-branch-template` | Feature branch template | `feature/{release-slug}-{n}-{slug}` |
| `hotfix-branch-template` | Hotfix branch template | `hotfix/{slug}` |
| `bugfix-branch-template` | Bugfix branch template | `bugfix/{slug}` |
| `bugfix-release` | Bugfix release branch | none: the oldest open release branch, opening one when none is open; `base`: the base branch, for repositories without release branches |
| `open-release-for-bugfixes` | Open release for bugfixes | `yes`: a bugfix with no release branch to target opens one ([Opening a release for a bugfix](#opening-a-release-for-a-bugfix)); `no`: it waits or stops with a blocker. Set `no` where `delivery-orchestration` does not run for milestones (an orchestrate workflow, and an orchestrate-on-merge workflow that reacts to `bugfix/` PRs into release branches), since nothing would complete the release |
| `issue-sources` | Issue sources | `sentry` (source skills the `issue-resolver` intake reads) |
| `resolve-label` | Resolve label | `ai:resolve` |
| `hotfix-label` | Hotfix label | `severity:critical` |
| `bugfix-label` | Bugfix label | `severity:normal` |
| `hotfix-criteria` | Hotfix criteria | the source marks it `fatal`, or a person added the hotfix label |
| `milestone-template` | Milestone template | `{key}` (for example `JIRA:{key}` gives `JIRA:ABC-123`) |
| `output-language` | Output language | `English` |
| `source-language` | Source language | `auto`: the language of the source ticket |
| `status-labels` | Status labels | `status:<state>`, see `work-status.md` |
| `project` | Project | none (`owner/number`) |
| `project-status-field` | Project status field | `Status` |
| `project-status-options` | Project status options | none: each state's default option, see `work-status.md` (`state=Option name` lines) |
| `research-sources` | Research sources | none (URLs or repository paths) |
| `context` | Context | none (free text from the caller) |
| `implement-workflow` | Implement workflow | `ai-implement.yml` |
| `max-parallel` | Max parallel | `3` |
| `requested-by` | n/a | the milestone's `requested-by` marker, else none |
| `release-notes-file` | Release notes file | none: no release notes step |
| `release-heading` | Release heading | `## {version}` |
| `release-version` | Release version | `{name}` (the milestone name form), or `next-patch`, `next-minor`, `next-major` |
| `version-files` | Version files | none (`path: what to set` lines, for example `package.json: version`) |
| `release-notes-branch-template` | Release notes branch template | `feature/{release-slug}-release-notes` |
| `no-release-paths` | No-release paths | none: every release gets notes (comma-separated globs, for example `docs/**, *.md`) |
| `qa-ci-setup` | QA in CI setup | none (targeted validation in CI: focused tests, the app or API headless, smoke checks) |
| `qa-browser` | QA browser | `playwright` (`playwright` or `selenium`) |

- Triage classification (category labels, Priority, Effort, Start and Target date, Size, Estimate, Owner) comes only from the profile's `## Triage` section and follows `triage.md`. A missing key skips that field; say which ones in the output.
- `context` and `research-sources` add information and constraints. They never override these skills' rules, the status flow, or a person's decision on the issue.
- Tracker credentials (for Jira `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) come only from the environment, as `tickets.md` describes. Never print them.
- Runs are non-interactive unless a person is in the conversation (always in CI: `CI` or `GITHUB_ACTIONS` set): never wait for input. Questions go to the ticket or issue, the item moves to its blocked state, and the step stops for that item.

## Requested-by and assignees

`requested-by` is the GitHub login of the person who started the flow. It is never a bot (a login ending in `[bot]`): ignore such a value.

- Business refinement records it in the milestone description as one line, `<!-- ai-delivery requested-by=<login> -->`: replace an existing marker line, or append the line. Never remove or rewrite the rest of the description. Later steps read it from there when the run has no `requested-by`.
- Where a step assigns a person (new issues, PRs), assign `requested-by` when known. Otherwise assign `@me` only when the identity is a person, as `tickets.md` says; with an App or bot token, skip the assignee.
- Pass `requested-by` on to every workflow a step dispatches (`-f requested_by=<login>`), only when that workflow declares the input (`gh workflow view <file> --yaml`).

## Stop points

Every run ends with a state a workflow can read without parsing prose:

- Each issue in scope has exactly one status label when the run exits (`work-status.md`). Never leave an issue in a state the run moved it to only for its own work.
- A blocked item gets one comment with the questions, in the language the skill says, whose first line is `<!-- ai-delivery blocker stage=<stage> -->` and whose second line is `Blocked: <one line: what is missing and why it blocks>`. `<stage>` is `business-refinement`, `technical-refinement`, `readiness-review`, `orchestrate`, or `implement`. Mention `requested-by` (never a bot), and, on a GitHub issue or PR, end with how to resume: ``Reply `/ai-resume` (optionally with instructions on the next lines) to continue.`` when the repository runs the resume workflow (a workflow in `.github/workflows/` handles `/ai-resume` comments), else `Answer here and run <stage> again.`; never a checkbox. On a re-run, edit that comment instead of adding another while the questions are the same.
- The output ends with a `Blocked:` list, one line per blocked item: `- #<issue> <state>: <one to three line summary> | questions: <comment URL>` (for a question posted on the source tracker, its comment URL too). `Blocked: none` when nothing is blocked.

## Release notes

When `release-notes-file` is set, a release is not ready for review until its notes are on the release branch. Delivery orchestration writes them once every issue is done, in their own PR into the release branch (release branches take changes only through PRs):

- **Version**: for a release opened for a bugfix (its milestone description has `<!-- ai-delivery auto-release -->`), the milestone title, fixed when it was opened; never recompute it. Otherwise `release-version` with `{name}` replaced by the milestone name form (`v0.1.0-beta.2.3`). `next-patch`, `next-minor`, and `next-major` increment the highest version already taken, keeping its `v` prefix when it has one: the highest of the versions in `release-notes-file` on `base-branch`, the repository's release tags (`git tag --list`, `gh release list`), and the versions of other open release branches when their names or notes show them. A release branch counts as open only when it has an open PR into `base-branch` (`gh pr list --base <base-branch> --head <branch> --state open`) or is the release branch of an open milestone with the `<!-- ai-delivery auto-release -->` marker (its version is the milestone title); a `release/*` branch with neither (left over after its release merged or was abandoned) is ignored. An open auto-release milestone keeps counting even when it was abandoned: when one is older than one day (its `created_at`), has no open PR into or from its release branch, and has no open issue, close it (`gh api -X PATCH repos/{owner}/{repo}/milestones/<number> -f state=closed`) and report it, so it stops reserving its version. Compare by semantic-version precedence and ignore tags with a path prefix (`app-name/v1.2.3`), which belong to sub-projects. The newest section of `release-notes-file` on `base-branch` whose version has a tag sets the current version line: ignore the tags created before that tag, because they belong to an earlier numbering the project restarted (`v0.1.25-beta.2` before a restart at `v0.1.0-beta.2`); newer sections without a tag yet still count. When the highest version is a pre-release (`v0.1.0-beta.2.2.14`), keep its form and increment its last numeric identifier (`v0.1.0-beta.2.2.15`) for any `next-*` step; never drop the pre-release part. The result must be greater than all of them, never equal or lower. `{version}` is that value; `{bare-version}` is the same without a leading `v` (`0.1.0-beta.2.3`). When the version cannot be read or computed, stop with a blocker that asks for it.
- **Sync**: do not merge `base-branch` into the release notes branch (it would also bring changes such as `.github/workflows/**`, which the agent's token may not push). Sync only the files this step writes: start `release-notes-file` from its content on `base-branch` (`git show origin/<base-branch>:<file>`), so sections added there after the release branch was cut are kept and the release PR into `base-branch` does not conflict in it, and put the new section at its top. Do the same for the version files when `base-branch` changed them. Any other drift of `base-branch` is not brought in by the release notes PR. If a push is still rejected, stop with a blocker that names the files it reports.
- **Section**: one new section at the top of `release-notes-file` (as it is on `base-branch` after Sync), above the newest existing one, with `release-heading` filled in (`{version}`, `{bare-version}`, `{date}` as `YYYY-MM-DD`), following the style of the existing sections. Its bullets summarize the merged task PRs for the people who read the changelog: what changed and why, not file lists. Never edit older sections.
- **Version files**: set each `version-files` entry to `{bare-version}` (for example `package.json: version` sets the `version` key). Nothing else changes.
- **Done**: the release branch's `release-notes-file` already has a section for `{version}` that `base-branch` does not have.
- **Not needed**: only when `no-release-paths` is set and every file the release changes (`git diff --name-only origin/<base-branch>...origin/<release-branch>`) matches one of its globs. Then write no notes, open no release notes PR, and compute no version; the release counts as having its notes. Any other file in the diff, or an unset `no-release-paths`, makes the notes required. The repository's release-note validation (for example a CI check that requires a new section) must exempt the same paths, or the milestone PR fails it: the run reads only the profile and never edits workflows.

## Milestone names and branches

- Milestone title: `milestone-template` with `{key}` replaced by the source key (`ABC-123`). For a GitHub milestone source, keep its title.
- Milestone slug: the title lowercased, every run of characters other than `a-z0-9` replaced by `-`, trimmed of `-` (`JIRA:ABC-123` -> `jira-abc-123`).
- Milestone name form: slugged the same way but keeping `.` (`v0.1.0-beta.2.3` stays `v0.1.0-beta.2.3`).
- Issue slug: the issue title slugged the same way, cut to about 40 characters.

### Branch model

| Branch | From | PR into | Use |
| --- | --- | --- | --- |
| release (`release-branch-template`) | `base-branch` | `base-branch` | A release being prepared. In the delivery flow the milestone branch is the release branch. |
| feature (`feature-branch-template`) | its release branch | that release branch | New work: one task of the milestone. |
| hotfix (`hotfix-branch-template`) | `base-branch` | `base-branch` | Urgent production fix. |
| bugfix (`bugfix-branch-template`) | the bugfix target (the open release branch, opened for it when none is open) | the bugfix target | Non-urgent production bug. Branching from the target keeps `base-branch` changes the release does not have out of the PR. |

- Template placeholders: `{slug}` is the milestone slug in the release template and the issue slug in the others; `{name}` is the milestone name form; `{release-slug}` and `{release-name}` are the release's milestone slug and name form; `{n}` is the issue number. For example `release/{name}` gives `release/v0.1.0-beta.2.3`, and `feature/{release-name}-{n}-{slug}` gives `feature/v0.1.0-beta.2.3-12-login-timeout`.
- Bugfix target: `bugfix-release` when the run or profile names it; else the oldest open release branch (the release branch with the oldest open PR into `base-branch`, else the release branch of the oldest open milestone that exists on the remote). A release whose milestone PR is already ready for review (not a draft) is not open for bugfixes: skip it. If there is none, open one, when `open-release-for-bugfixes` is not `no`, as [Opening a release for a bugfix](#opening-a-release-for-a-bugfix) says; only when that fails, the flow falls back (it waits or stops with a blocker, as its skill or agent says) and says why.
- Never create refs under another branch's name (`release/<x>/...` when `release/<x>` exists): Git cannot hold both.
- Existing branches are never renamed. When the milestone or task already has a branch or PR under an older name (for example `feat/<milestone-slug>`), keep using it until that work is merged.
- A `develop` branch, when the repository keeps one, only mirrors `base-branch`; nothing branches from or merges into it.
- Severity picks the branch for a production issue: one that meets `hotfix-criteria` (or carries `hotfix-label`) gets a hotfix branch into `base-branch`; anything else gets a bugfix branch into the bugfix target.

### Opening a release for a bugfix

When a bugfix (`dependency-updates`, `issue-resolver`) has no release branch to target, `bugfix-release` is not `base`, and `open-release-for-bugfixes` is not `no`, it opens a release that `delivery-orchestration` then completes like any milestone. At most one auto-opened release takes fixes at a time: once it exists, it is the oldest open release branch, and later bugfixes target it until its milestone PR is ready for review; after that the next bugfix opens a new release with the next version. Look for the target again right before step 1, since another run may have opened one.

1. **Version**: the next version as [Release notes](#release-notes) computes it, above the highest of the versions in `release-notes-file` on `base-branch`, the release tags, and the open release branches (only those that count as open there). Increment with `release-version` when it is `next-patch`, `next-minor`, or `next-major`, else `next-patch`. The pre-release and path-prefix rules of [Release notes](#release-notes) apply.
2. **Milestone**: title `{version}` (for example `v1.4.3`), so the default `release-version` (`{name}`) gives the same version when orchestration writes the notes. Reuse an open milestone with that title (an earlier run that could not create the branch, or a concurrent run: when creating it fails with 422 because the title exists, re-read the milestones and reuse it). Otherwise create it (`gh api repos/{owner}/{repo}/milestones -f title=<version> -f description=<text>`) with a description of one line saying it was opened automatically for a bugfix because no release branch was open, the line `<!-- ai-delivery auto-release -->`, and the `requested-by` marker when known ([Requested-by and assignees](#requested-by-and-assignees)).
3. **Release branch**: the milestone branch exactly as orchestration resolves it: `release-branch-template` with the milestone's slug and name form (`release/{slug}` gives `release/v1-4-3`, `release/{name}` gives `release/v1.4.3`), created from the head of `base-branch` (`git fetch origin <base-branch>`, then `git push origin origin/<base-branch>:refs/heads/<release-branch>`). When the push is rejected because the branch already exists (a concurrent run created it), fetch it and use it if it is the release branch of that open milestone. It is the bugfix target.
4. **Tracking issue** in the milestone, so orchestration counts the fix: the flow's own issue moved into it (`gh issue edit <n> --milestone <title>`), or a new one when the flow has none. An issue already in another open milestone stays there: create a new tracking issue whose body has the line `Fix for #<n>` instead, and the bugfix PR closes that one. Orchestration moves the linked issue to `done` with the tracking issue and closes it with the milestone, so the other milestone stops waiting on it. Its status is `in-progress` while the fix is made and `in-review` once its PR is open (`work-status.md`). The bugfix PR into the release branch has `Closes #<issue>` in its body (orchestration matches PRs into the milestone branch to issues by that link) and the milestone set (`gh pr create --milestone <title>`), which tells an orchestrate-on-merge workflow which milestone to run. Any later bugfix into a release with the `auto-release` marker adds its tracking issue the same way.
5. **Fallback**: before falling back, look for the target again and use an open release a concurrent run opened. When there is still none and the version cannot be computed or the branch cannot be created (a ruleset or permission refuses the ref, or the push fails), create no issue and no PR: the flow falls back to its behaviour without a target and reports the error. Leave the milestone; a later run reuses it.
6. **Hand-off**: no milestone PR is opened here: the release branch has no commit ahead of `base-branch` until the bugfix PR merges, and orchestration opens the draft milestone PR then. When the bugfix PR merges into the release branch, `delivery-orchestration` for the milestone (re-run by the repository's orchestrate-on-merge workflow when it reacts to `bugfix/` PRs into release branches; otherwise run it for the milestone) moves the issue to `done`, opens the draft milestone PR, writes the release notes in their own PR, marks the milestone PR ready for a human once they merge, and closes the milestone after the milestone PR merges.

## Profile template

Copy to `docs/ai/delivery.md` and remove the lines you do not need.

```markdown
# Delivery

## Repository scope
- Owns: <what this repository delivers: product areas, services, apps>
- Does not own: <areas that live in other repositories, and where>
- Code map: <area: paths>

## Source
- Source tracker: <github | jira>
- Milestone template: <{key} | JIRA:{key}>
- Source language: <auto | language>
- Blocked marker on the source: <label | workflow status | none>

## Output
- Output language: <English>

## Status
- Status labels: <state=label lines>
- Labels managed elsewhere: <yes | no>
- Project: <owner/number | none>
- Project status field: <Status>
- Project status options: <state=Option name lines; several states may share one option>

## Triage
- Category labels: <labels that describe the kind of change>
- Priority field: <issue field or project field name>; options: <Urgent, High, Medium, Low>
- Effort field: <name>; options: <High, Medium, Low>
- Start date field: <name>
- Target date field: <name>
- Size field: <name>; options: <XS, S, M, L, XL>
- Estimate field: <name>
- Size to Estimate scale: <XS=3, S=5, M=8, L=13, XL=21>
- Estimate source: <history | plan>
- Owner: <login | none>

## Branches and orchestration
- Base branch: <main>
- Release branch template: <release/{slug}>
- Feature branch template: <feature/{release-slug}-{n}-{slug}>
- Hotfix branch template: <hotfix/{slug}>
- Bugfix branch template: <bugfix/{slug}>
- Bugfix release branch: <release branch name | base | none: the oldest open release branch, opened when none is open>
- Open release for bugfixes: <yes | no: wait or block when no release branch is open; set it when delivery-orchestration does not run here>
- Implement workflow: <ai-implement.yml>
- Max parallel: <3>

## Issue resolution
- Issue sources: <sentry>
- Resolve label: <ai:resolve>
- Hotfix label: <severity:critical>
- Bugfix label: <severity:normal>
- Hotfix criteria: <for example: level fatal, or at least 100 users affected in the period, or a core flow (login, checkout) fails>

## Release notes
- Release notes file: <CHANGELOG.md | none>
- Release heading: <## {version} | ## [{bare-version}] - {date}>
- Release version: <{name} | next-patch | next-minor | next-major>
- Version files: <path: what to set lines, for example `package.json: version` | none>
- Release notes branch template: <feature/{release-slug}-release-notes>
- No-release paths: <comma-separated globs whose changes need no release notes, matching the repository's release-note check exemption, for example `docs/**, *.md, AGENTS.md, CLAUDE.md, .ai/**` | none>

## QA in CI
- QA in CI setup: <command that installs the browsers and starts the test environment in CI | none: targeted validation>
- QA browser: <playwright | selenium>

## Research
- Research sources: <URLs or repository paths>

## Context
<rules and conventions every step of the flow should follow>
```
