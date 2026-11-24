# Delivery flow

Four skills and five Claude Code agents take a request from a source ticket to reviewed PRs, one task at a time and in parallel where it is safe. Each step is a separate, non-interactive run, started by a person or by a workflow (for example a GitHub Actions `workflow_dispatch`). Questions never wait for an answer: they go on the ticket or issue, the item moves to a blocked state, and the next run picks up the answer.

```text
source ticket (Jira, GitHub issue or milestone)
  │ business-refinement      (business-analyst)
  ▼
milestone + business issues ── unclear ──► comment on the source, business-blocked
  │ technical-refinement     (tech-lead, uses ticket-plan per issue)
  ▼
issues with technical plans and dependencies ── questions ──► technical-blocked
  │ readiness-review         (readiness-reviewer)
  ▼
ready ── not ready ──► back to business or technical refinement
  │ delivery-orchestration   (delivery-orchestrator; re-run on each task PR merge)
  ▼
milestone branch feat/<milestone-slug> + task branches feat/<milestone-slug>-<n>-<slug>
  │ implement                (task-implementer: dev ─► quality-cycle ─► pr-create)
  ▼
task PR into the milestone branch, in-review
  │ PR follow-up             (pr-shepherd / pr-fix, then the repository's merge process)
  ▼
merged ─► done ─► when every issue is done: milestone PR into the base branch
```

| Task | Agent | Skills | Input | Moves issues to |
| --- | --- | --- | --- | --- |
| business refinement | `business-analyst` | [`business-refinement`](skills/business-refinement.md) | `source` | `needs-technical-refinement`, `business-blocked` |
| technical refinement | `tech-lead` | [`technical-refinement`](skills/technical-refinement.md), [`ticket-plan`](skills/ticket-plan.md) | `milestone` or `issue` | `needs-review`, `technical-blocked` |
| readiness review | `readiness-reviewer` | [`readiness-review`](skills/readiness-review.md) | `milestone` or `issue` | `ready`, back to `needs-business-refinement` or `needs-technical-refinement` |
| orchestrate | `delivery-orchestrator` | [`delivery-orchestration`](skills/delivery-orchestration.md) | `milestone` | `in-progress`, `done` |
| implement | `task-implementer` | [`dev`](skills/dev.md), [`quality-cycle`](skills/quality-cycle.md), [`pr-create`](skills/pr-create.md) | `issue`, `branch`, `base-branch` | `in-review` |

In CI, `delivery-orchestration` dispatches the implement workflow (`implement-workflow`, default `ai-implement.yml`) with the dispatch inputs `issue`, `branch`, and `base_branch` (the milestone branch), up to `max-parallel` at a time. Outside CI, the `delivery-orchestrator` agent delegates the same task to `task-implementer` agents. Nothing in the flow merges: task PRs and the milestone PR go through the repository's own review and merge process (for example `pr-shepherd`, and `merge-risk` where a team allows it).

## Status

Each issue carries one status label, `status:<state>` by default: `needs-business-refinement`, `business-blocked`, `needs-technical-refinement`, `technical-blocked`, `needs-review`, `ready`, `in-progress`, `in-review`, `done`. Each transition replaces the previous label. Override labels with `status-labels` (`state=label` lines). With `project` (`owner/number`), the issue is added to that GitHub Project and its single-select `project-status-field` (default `Status`) is set to the matching option: `project-status-options` maps states to option names (`state=Option name` lines, several states may share one option), and an unmapped state defaults to its Title Case name, for example `In review`. A state with no matching option leaves the field unchanged and is reported. Rules: [work-status.md](../shared/references/work-status.md).

## Triage

Every issue the flow creates or refines carries triage for metrics and future estimates: category labels, Priority, Effort, Start and Target date, Size, and Estimate, written to labels, GitHub Project fields, or organization issue fields as the profile's `## Triage` section names them (the issue field wins when a project field mirrors it). `business-refinement` sets the first values, `technical-refinement` revises them after the plan (splitting anything above the largest size), and `readiness-review` does not pass an issue with a required field missing. Estimates follow the Size scale and the history of similar closed work. Values people set change only when a refinement changes the scope, with a comment. Rules: [triage.md](../shared/references/triage.md).

## Profile

Run inputs override the repository profile `docs/ai/delivery.md` (or `profile`), which overrides the defaults. One profile serves every step: repository scope and code map, source tracker, milestone template, languages, status labels and Project, triage fields, base branch, implement workflow, parallel limit, research sources, and free-text context. Template and the full input list: [delivery-profile.md](../shared/references/delivery-profile.md).

## Trackers

Jira sources are read and commented through whatever access the harness has, including the REST API with `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` already in the environment (never printed). Attachments and inline images are downloaded and read. See [tickets.md](../shared/references/tickets.md).
