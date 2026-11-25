# Delivery flow

Four skills and five agents (Claude Code and OpenCode) take a request from a source ticket to reviewed PRs, one task at a time and in parallel where it is safe. Each step is a separate, non-interactive run, started by a person or by a workflow (for example a GitHub Actions `workflow_dispatch`). Questions never wait for an answer: they go on the ticket or issue, the item moves to a blocked state, and a resume picks up the answer. In CI the steps chain on their own, so one dispatch of the first step runs the whole flow until it needs a person.

```text
source ticket (Jira, GitHub issue, or GitHub milestone with its issues)
  │ business-refinement      (business-analyst)
  ▼
milestone + business issues ── unclear ──► questions on the source/issue, business-blocked
  │ technical-refinement     (tech-lead, uses ticket-plan per issue)
  ▼
issues with technical plans and dependencies ── questions ──► technical-blocked
  │ readiness-review         (readiness-reviewer)
  ▼
ready ── not ready ──► back to business or technical refinement
  │ delivery-orchestration   (delivery-orchestrator; re-run on each task PR merge)
  ▼
milestone branch feat/<milestone-slug> (from the default branch)
  + task branches feat/<milestone-slug>-<n>-<slug> (from the milestone branch)
  + draft milestone PR: milestone branch -> default branch
  │ implement                (task-implementer: dev ─► quality-cycle ─► pr-create)
  ▼
task PR into the milestone branch, in-review ── escalated ──► PR labeled ai:needs-human
  │ PR follow-up             (pr-fix rounds, then merge-risk; task PRs may merge on their own)
  ▼
merged ─► done ─► all done: milestone PR ready for review ─► human approval and merge
  ─► every issue done, milestone closed
```

| Task | Agent | Skills | Input | Leaves issues in |
| --- | --- | --- | --- | --- |
| business refinement | `business-analyst` | [`business-refinement`](skills/business-refinement.md) | `source` | `needs-technical-refinement`, or `business-blocked` |
| technical refinement | `tech-lead` | [`technical-refinement`](skills/technical-refinement.md), [`ticket-plan`](skills/ticket-plan.md) | `milestone` or `issue` | `needs-review`, `technical-blocked`, or `needs-business-refinement` |
| readiness review | `readiness-reviewer` | [`readiness-review`](skills/readiness-review.md) | `milestone` or `issue` | `ready`, `needs-business-refinement`, or `needs-technical-refinement` |
| orchestrate | `delivery-orchestrator` | [`delivery-orchestration`](skills/delivery-orchestration.md) | `milestone` | `in-progress`, `done` (back to `ready` when a dispatch fails) |
| implement | `task-implementer` | [`dev`](skills/dev.md), [`quality-cycle`](skills/quality-cycle.md), [`pr-create`](skills/pr-create.md) | `issue`, `branch`, `base-branch` | `in-review` (PR labeled `ai:needs-human` when escalated), or `technical-blocked` |

Every step also takes `requested-by`, the GitHub login of the person who started the flow; see [Requested-by](#requested-by).

## Set up

You need a repository with GitHub Actions, the reusable workflows from [fbrissi/github-actions](https://github.com/fbrissi/github-actions), and this library's skills and agents on the runner. The reusable workflows' README is the reference for their inputs, secrets, and App permissions; the steps below are the order to follow.

1. **GitHub App.** Install a GitHub App on the repository and give the workflows its id and private key, as the github-actions docs name them. Steps act as the App: labels, issues, milestones, branches, PRs, and workflow dispatches. Issue fields need only `issues: write`. A GitHub Project needs the App's organization projects permission.
2. **Secrets.** The harness credentials the reusable workflows ask for, and for a Jira source `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` (read, comment, and attachment download).
3. **Labels.** Create them once (the steps also create a missing label on first use, unless the profile says labels are managed elsewhere):
   - `status:needs-business-refinement`, `status:business-blocked`, `status:needs-technical-refinement`, `status:technical-blocked`, `status:needs-review`, `status:ready`, `status:in-progress`, `status:in-review`, `status:done` (or the names in `status-labels`)
   - `ai:auto-fix` and `ai:needs-human` (PR follow-up)
   - your hold labels for merges (`merge-risk` default: `do-not-merge`, `hold`)
4. **Project (optional).** With `project`, the issue's single-select Status field must already have an option for each state, by default `Needs business refinement`, `Business blocked`, `Needs technical refinement`, `Technical blocked`, `Needs review`, `Ready`, `In progress`, `In review`, `Done`. Map several states to one option with `project-status-options` (for example `business-blocked=Blocked`). The steps never create options.
5. **Profile.** Add `docs/ai/delivery.md` from the [template](../shared/references/delivery-profile.md#profile-template): repository scope, source tracker, milestone template, base branch, and `## QA in CI`. Add the `quality-cycle`, `review-changes`, `qa-e2e`, and `bdd-scenarios` profiles for the implement step.
6. **Workflows.** Add the stage callers from the github-actions `ai-task.yml` reusable workflow (default files `ai-business-refinement.yml`, `ai-technical-refinement.yml`, `ai-readiness-review.yml`, `ai-orchestrate.yml`, `ai-implement.yml`), the PR follow-up callers (`pr-fix`, `merge-decision`) with branch prefixes that cover task branches and the milestone branch, and a caller of `ai-resume.yml` on `issue_comment: [edited]`.
7. **Versions.** Pin the ai-skills version the workflows install. Release this library first (merging tags `vX.Y.Z`), then github-actions, then bump the pins in your repository.

## Start and chain

Start with one dispatch of the business refinement workflow (`source`, or `jira_key` for Jira, and optionally `requested_by`; it defaults to whoever triggered it). After each step, the workflow reads the milestone issues' `status:*` labels and decides the next one, so the flow continues without a person:

| After | Labels found | Next |
| --- | --- | --- |
| business refinement | any `business-blocked` | handoff to a person |
| | else any `needs-technical-refinement` | technical refinement |
| technical refinement | any `technical-blocked` | handoff |
| | else any `needs-business-refinement` | business refinement |
| | else any `needs-review` | readiness review |
| readiness review | any `needs-business-refinement` / `needs-technical-refinement` | that refinement |
| | else issues `ready` | orchestrate |
| orchestrate | | dispatches implement per startable issue |
| implement | escalated or failed | handoff (resume implement, or pr-fix when a PR exists) |

A loop guard limits automatic dispatches per milestone and step (default 3); above it, the workflow hands off instead. A failed or timed-out run hands off with the run URL and moves an issue stuck in `in-progress` back to `ready`.

This works because every step leaves a state a workflow can read: one status label per issue in scope, and for each blocked item one comment that starts with `<!-- ai-delivery blocker stage=<stage> -->` and `Blocked: <one line>`, followed by the questions. Each step's output ends with a `Blocked:` list (`- #<issue> <state>: <summary> | questions: <comment URL>`), which the handoff quotes.

A Jira source with open questions and no GitHub issue yet gets a tracking issue `JIRA:<key> - business refinement` in the milestone, labeled `status:business-blocked` and linking the Jira comment, so the handoff has a place to go. It is closed once the answers are folded into the issues.

## Resume

A handoff is one bot comment per blocked issue (or PR) that mentions `requested-by`, names the step, quotes the blocker, links the questions, and ends with a checkbox:

```md
- [ ] Resume: technical-refinement -> continues automatically to readiness-review
<!-- ai-resume stage=technical-refinement milestone=JIRA:ABC-123 issue=42 pr= requested-by=octocat -->
```

Answer the questions where they were asked (the Jira comment or the issue), then tick the box. The `ai-resume.yml` workflow acts only on a bot comment with that marker whose box went from unchecked to checked by someone with write access. It re-runs the blocked step, which reads your answer, and the chain continues from there. The comment is edited to `Resumed by @<you> -> <run link>`, so it cannot fire twice. A collapsed block in the comment has the equivalent `gh workflow run` command.

## Requested-by

`requested-by` is recorded once in the milestone description as `<!-- ai-delivery requested-by=<login> -->` (the rest of the description is kept), and every later step and chained dispatch reads it from there. It is used as the assignee of new issues and PRs instead of `@me` (which fails with an App token), for mentions in handoffs, and as the reviewer requested on the milestone PR. Bots are never mentioned.

## GitHub milestone as the source

A GitHub milestone source needs no description: its existing issues are the request. Business refinement reads all of them with comments and attachments and reorganizes them in place: rewrites each body into the business format (the original text kept in a collapsed `Original request` section), rewords titles, splits an issue holding several deliverables, and merges duplicates into the oldest one (the merged-away issue is closed with a link to the survivor). It never creates a parallel set of issues, never touches issues already `in-progress` or later, and keeps the triage values people set. Technical refinement may later split or merge again, but only for code reasons (areas, dependencies, size), and both keep every issue in the milestone.

## Branches and PRs

One milestone produces many PRs, so they are stacked:

1. Orchestration creates the milestone branch `feat/<milestone-slug>` from the default branch (`base-branch`) first.
2. Each task branch `feat/<milestone-slug>-<n>-<slug>` is created from the milestone branch, and each task PR targets the milestone branch. Task PRs go through PR follow-up (`pr-fix` rounds, then `merge-risk`) and may merge on their own when the AI review approved, CI is green, and the risk is low, where the repository enables it.
3. One milestone PR, from the milestone branch into the default branch, aggregates every task PR, so reviewers see one combined diff. Orchestration opens it as a draft as soon as the milestone branch has a commit, keeps its body current (every issue with `Closes #<n>`, its status and task PR), and marks it ready for review, requesting `requested-by` as reviewer, when every issue is done. It always needs a human approval.
4. When the milestone PR merges, orchestration runs again, moves every issue to `done`, and closes the milestone.

## QA in CI

The implement step runs a review and QA cycle before opening its PR. When the project can provide a browser and a test environment in CI (the profile's `QA in CI setup` command, which installs Playwright or Selenium browsers and starts the stack), QA runs the BDD scenarios in a real browser. Otherwise QA runs tests-only: it relies on the automated tests that already run as PR checks (without re-running them), reports `browser QA skipped: no CI environment` in the cycle and the PR body, and does not escalate for that reason.

## Attachments

For a Jira source, each issue gets an `## Attachments` section: each attachment's Jira URL and a text description of what it shows (screens, values, error text). Inline images are matched to attachments through Jira's `renderedFields`. Technical refinement and implementation download and read the listed attachments when the Jira credentials are in the environment, and otherwise work from the descriptions.

## Status

Each issue carries one status label, `status:<state>` by default: `needs-business-refinement`, `business-blocked`, `needs-technical-refinement`, `technical-blocked`, `needs-review`, `ready`, `in-progress`, `in-review`, `done`. Each transition replaces the previous label. Override labels with `status-labels` (`state=label` lines). With `project` (`owner/number`), the issue is added to that GitHub Project and its single-select `project-status-field` (default `Status`) is set to the matching option: `project-status-options` maps states to option names (`state=Option name` lines, several states may share one option), and an unmapped state defaults to its Title Case name, for example `In review`. A state with no matching option leaves the field unchanged and is reported. Rules: [work-status.md](../shared/references/work-status.md).

## Triage

Every issue the flow creates or refines carries triage for metrics and future estimates: category labels, Priority, Effort, Start and Target date, Size, and Estimate, written to labels, GitHub Project fields, or organization issue fields as the profile's `## Triage` section names them (the issue field wins when a project field mirrors it). `business-refinement` sets the first values, `technical-refinement` revises them after the plan (splitting anything above the largest size), and `readiness-review` does not pass an issue with a required field missing. Estimates follow the Size scale and the history of similar closed work. Values people set change only when a refinement changes the scope, with a comment. Rules: [triage.md](../shared/references/triage.md).

## Profile

Run inputs override the repository profile `docs/ai/delivery.md` (or `profile`), which overrides the defaults. One profile serves every step: repository scope and code map, source tracker, milestone template, languages, status labels and Project, triage fields, base branch, implement workflow, parallel limit, research sources, and free-text context. Template and the full input list: [delivery-profile.md](../shared/references/delivery-profile.md).

## Trackers

Jira sources are read and commented through whatever access the harness has, including the REST API with `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` already in the environment (never printed). Attachments and inline images are downloaded and read. See [tickets.md](../shared/references/tickets.md).
