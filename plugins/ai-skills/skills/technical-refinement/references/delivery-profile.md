# Delivery inputs and profile

One profile serves the whole delivery flow: `business-refinement`, `technical-refinement`, `readiness-review`, and `delivery-orchestration`.

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
| `bugfix-release` | Bugfix release branch | none: the oldest open release branch |
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
| `qa-ci-setup` | QA in CI setup | none (tests-only QA in CI) |
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
| bugfix (`bugfix-branch-template`) | `base-branch` | the open release branch | Non-urgent production bug. |

- Template placeholders: `{slug}` is the milestone slug in the release template and the issue slug in the others; `{name}` is the milestone name form; `{release-slug}` and `{release-name}` are the release's milestone slug and name form; `{n}` is the issue number. For example `release/{name}` gives `release/v0.1.0-beta.2.3`, and `feature/{release-name}-{n}-{slug}` gives `feature/v0.1.0-beta.2.3-12-login-timeout`.
- Bugfix target: `bugfix-release` when the run or profile names it; else the oldest open release branch (the release branch with the oldest open PR into `base-branch`, else the release branch of the oldest open milestone that exists on the remote). If there is none, do not guess: stop with a blocker that asks which release the fix goes into.
- Never create refs under another branch's name (`release/<x>/...` when `release/<x>` exists): Git cannot hold both.
- Existing branches are never renamed. When the milestone or task already has a branch or PR under an older name (for example `feat/<milestone-slug>`), keep using it until that work is merged.
- A `develop` branch, when the repository keeps one, only mirrors `base-branch`; nothing branches from or merges into it.

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
- Bugfix release branch: <release branch name | none: the oldest open release branch>
- Implement workflow: <ai-implement.yml>
- Max parallel: <3>

## QA in CI
- QA in CI setup: <command that installs the browsers and starts the test environment in CI | none>
- QA browser: <playwright | selenium>

## Research
- Research sources: <URLs or repository paths>

## Context
<rules and conventions every step of the flow should follow>
```
