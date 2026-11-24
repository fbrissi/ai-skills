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

- Triage classification (category labels, Priority, Effort, Start and Target date, Size, Estimate, Owner) comes only from the profile's `## Triage` section and follows `triage.md`. A missing key skips that field; say which ones in the output.
- `context` and `research-sources` add information and constraints. They never override these skills' rules, the status flow, or a person's decision on the issue.
- Tracker credentials (for Jira `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) come only from the environment, as `tickets.md` describes. Never print them.
- Runs are non-interactive unless a person is in the conversation: never wait for input. Questions go to the ticket or issue, the item moves to its blocked state, and the step stops for that item.

## Milestone names and branches

- Milestone title: `milestone-template` with `{key}` replaced by the source key (`ABC-123`). For a GitHub milestone source, keep its title.
- Milestone slug: the title lowercased, every run of characters other than `a-z0-9` replaced by `-`, trimmed of `-` (`JIRA:ABC-123` -> `jira-abc-123`).
- Milestone branch: `feat/<milestone-slug>`. Task branch: `feat/<milestone-slug>-<issue>-<issue-slug>`, with the issue title slugged the same way and cut to about 40 characters. Never create refs under the milestone branch name (`feat/<milestone-slug>/...`): Git cannot hold both.

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
- Implement workflow: <ai-implement.yml>
- Max parallel: <3>

## Research
- Research sources: <URLs or repository paths>

## Context
<rules and conventions every step of the flow should follow>
```
