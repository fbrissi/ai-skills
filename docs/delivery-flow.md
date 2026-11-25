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
release (milestone) branch release/<milestone-slug> (from the default branch)
  + feature branches feature/<milestone-slug>-<n>-<slug> (from the release branch)
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
   - `ai:resolve`, `severity:critical`, and `severity:normal` (issue resolution, or the names in the profile)
   - your hold labels for merges (`merge-risk` default: `do-not-merge`, `hold`)
4. **Project (optional).** With `project`, the issue's single-select Status field must already have an option for each state, by default `Needs business refinement`, `Business blocked`, `Needs technical refinement`, `Technical blocked`, `Needs review`, `Ready`, `In progress`, `In review`, `Done`. Map several states to one option with `project-status-options` (for example `business-blocked=Blocked`). The steps never create options.
5. **Profile.** Add `docs/ai/delivery.md` from the [template](../shared/references/delivery-profile.md#profile-template): repository scope, source tracker, milestone template, base branch, branch templates, and `## QA in CI`. Add the `quality-cycle`, `review-changes`, `qa-e2e`, and `bdd-scenarios` profiles for the implement step.
6. **Workflows.** Add the stage callers from the github-actions `ai-task.yml` reusable workflow (default files `ai-business-refinement.yml`, `ai-technical-refinement.yml`, `ai-readiness-review.yml`, `ai-orchestrate.yml`, `ai-implement.yml`), the PR follow-up callers (`pr-fix`, `merge-decision`) with branch prefixes that cover the branch model (`feature/ release/ hotfix/ bugfix/`, plus any older prefixes still open), and a caller of `ai-resume.yml` on `issue_comment: [created]`. For production issues, add a weekly intake caller and a resolve caller on `issues: [labeled]` for the github-actions `issue-intake` and `issue-resolve` tasks of `ai-task.yml` (default callers `ai-issue-intake.yml` and `ai-issue-resolve.yml`; see [Issue resolution](#issue-resolution)), and a `branch-sync.yml` caller on `push` to the default branch when you keep a `develop` mirror.
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

In CI no step asks or waits: every question point either uses its non-interactive default (for example `pr-fix` in `auto` mode) or ends in a blocker comment and a handoff.

A loop guard limits automatic dispatches per milestone and step (default 3); above it, the workflow hands off instead. A failed or timed-out run hands off with the run URL and moves an issue stuck in `in-progress` back to `ready`.

This works because every step leaves a state a workflow can read: one status label per issue in scope, and for each blocked item one comment that starts with `<!-- ai-delivery blocker stage=<stage> -->` and `Blocked: <one line>`, followed by the questions. Each step's output ends with a `Blocked:` list (`- #<issue> <state>: <summary> | questions: <comment URL>`), which the handoff quotes.

A Jira source with open questions and no GitHub issue yet gets a tracking issue `JIRA:<key> - business refinement` in the milestone, labeled `status:business-blocked` and linking the Jira comment, so the handoff has a place to go. It is closed once the answers are folded into the issues.

## Resume

A handoff is one bot comment per blocked issue (or PR) that mentions `requested-by`, names the step, quotes the blocker, links the questions, and says how to continue:

```md
Reply `/ai-resume` (optionally with instructions on the next lines) to continue: technical-refinement -> readiness-review.
<!-- ai-resume stage=technical-refinement milestone=JIRA:ABC-123 issue=42 pr= requested-by=octocat state=open -->
```

Answer the questions where they were asked (the Jira comment or the issue), then post a new comment whose first line starts with `/ai-resume`:

- `/ai-resume` resumes the newest open handoff on that issue or PR.
- `/ai-resume <stage>` resumes that stage (for example `/ai-resume pr-fix`), with or without an open handoff.
- Anything after the stage on the first line, and every following line, is passed to the resumed run as its `instructions`.

The `ai-resume.yml` workflow acts only on comments from people with write, maintain, or admin access (bots are ignored). It adds an `eyes` reaction, marks the handoff `state=resumed` (`Resumed by @<you> -> <run link>`) before it dispatches, so a handoff runs once, then adds a `rocket` reaction and replies with the run link, or replies with the reason when it rejects the command. With no open handoff and no stage, it replies with the stages it knows. Resuming `pr-fix` removes `ai:needs-human`. A collapsed block in the handoff has the equivalent `gh workflow run` command. There is no checkbox to tick.

Skills that stop in CI write their own blocker comment the same way: they mention `requested-by`, say what is missing, and end with the `/ai-resume` line when the repository runs the resume workflow (shared rule: [non-interactive.md](../shared/references/non-interactive.md)).

## Instructions

Every entry point takes an optional `instructions` input (stage workflows, `pr-fix`, `merge-decision`, `code-review`, and `/ai-resume` from the comment). The text is appended to the agent prompt as additional instructions for that run only: chained dispatches do not pass it on. Like `context`, it adds information and constraints and never overrides the skills' rules or a person's decision on the issue.

## Requested-by

`requested-by` is recorded once in the milestone description as `<!-- ai-delivery requested-by=<login> -->` (the rest of the description is kept), and every later step and chained dispatch reads it from there. It is used as the assignee of new issues and PRs instead of `@me` (which fails with an App token), for mentions in handoffs, and as the reviewer requested on the milestone PR. Bots are never mentioned.

## GitHub milestone as the source

A GitHub milestone source needs no description: its existing issues are the request. Business refinement reads all of them with comments and attachments and reorganizes them in place: rewrites each body into the business format (the original text kept in a collapsed `Original request` section), rewords titles, splits an issue holding several deliverables, and merges duplicates into the oldest one (the merged-away issue is closed with a link to the survivor). It never creates a parallel set of issues, never touches issues already `in-progress` or later, and keeps the triage values people set. Technical refinement may later split or merge again, but only for code reasons (areas, dependencies, size), and both keep every issue in the milestone.

## Branches and PRs

The branch model has four kinds of branch, named by templates in the profile (defaults shown):

| Branch | Template (default) | From | PR into |
| --- | --- | --- | --- |
| release | `Release branch template` (`release/{slug}`) | default branch | default branch |
| feature | `Feature branch template` (`feature/{release-slug}-{n}-{slug}`) | its release branch | that release branch |
| hotfix | `Hotfix branch template` (`hotfix/{slug}`) | default branch | default branch |
| bugfix | `Bugfix branch template` (`bugfix/{slug}`) | default branch | the open release branch (`Bugfix release branch`, else the oldest open one; with none, a handoff asks which) |

In the delivery flow the milestone branch is the release branch. A `develop` branch, when kept, is only a mirror of the default branch, fast-forwarded after each merge (the github-actions `branch-sync.yml` workflow). Branches that already exist under older names (for example `feat/<milestone-slug>`) are never renamed and keep being used until merged. Template placeholders and examples: [delivery-profile.md](../shared/references/delivery-profile.md#branch-model).

One milestone produces many PRs, so they are stacked:

1. Orchestration creates the release branch (default `release/<milestone-slug>`) from the default branch (`base-branch`) first.
2. Each feature branch (default `feature/<milestone-slug>-<n>-<slug>`) is created from the release branch, and each task PR targets the release branch. Task PRs go through PR follow-up (`pr-fix` rounds, then `merge-risk`) and may merge on their own when the AI review approved, CI is green, and the risk is low, where the repository enables it. Only PRs the agent App opened into a release branch can skip the human approval; PRs people open, and every PR into the default branch (release and hotfix PRs), need one. `merge-risk` takes the base list and a max risk per base from its profile, so task PRs into `release/*` can use a different limit than PRs into the default branch.
3. One milestone PR, from the release branch into the default branch, aggregates every task PR, so reviewers see one combined diff. Orchestration opens it as a draft as soon as the release branch has a commit, keeps its body current (every issue with `Closes #<n>`, its status and task PR), and marks it ready for review, requesting `requested-by` as reviewer, when every issue is done. It always needs a human approval.
4. When the milestone PR merges, orchestration runs again, moves every issue to `done`, and closes the milestone.

## Issue resolution

Production problems take a shorter path than milestones, with the [`issue-resolver`](claude-code-agents.md#issue-resolver) agent:

1. **Intake** (for example a weekly schedule) reads the source with [`sentry-issues`](skills/sentry-issues.md) and keeps one GitHub issue per Sentry issue (marker `<!-- ai-issue source=sentry id=<id> -->`, so it never duplicates), with a severity label decided by the profile's `Hotfix criteria` and the `Resolve label` (`ai:resolve`).
2. **Resolve** runs when an issue gets the resolve label (people can label any issue). Critical issues get a hotfix branch into the default branch; the rest get a bugfix branch into the open release branch. It diagnoses with `observability-triage`, writes a failing test first, runs the review and QA cycle, opens the PR, and stops.
3. **Follow-up** is the usual PR follow-up: `pr-fix` on review and CI events, then the merge decision. Hotfix PRs into the default branch need a human approval.

Configure it in the profile's `## Issue resolution` section and the `sentry-issues` profile; credentials (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, optional `SENTRY_BASE_URL`) come from secrets.

## QA in CI

The implement step runs a review and QA cycle before opening its PR. When the project can provide a browser and a test environment in CI (the profile's `QA in CI setup` command, which installs Playwright or Selenium browsers and starts the stack), QA runs the BDD scenarios for what the task changed in a real browser, writing scenarios for new behavior first. Otherwise QA runs targeted validation: it runs (or writes) focused tests for the new behavior, starts the app or API headless when feasible and exercises the changed endpoints or commands, runs the framework's smoke checks, and reports that evidence in the cycle and the PR body. It never escalates only because there is no E2E setup; adding one later only needs the profile value.

## Attachments

For a Jira source, each issue gets an `## Attachments` section: each attachment's Jira URL and a text description of what it shows (screens, values, error text). Inline images are matched to attachments through Jira's `renderedFields`. Technical refinement and implementation download and read the listed attachments when the Jira credentials are in the environment, and otherwise work from the descriptions.

## Status

Each issue carries one status label, `status:<state>` by default: `needs-business-refinement`, `business-blocked`, `needs-technical-refinement`, `technical-blocked`, `needs-review`, `ready`, `in-progress`, `in-review`, `done`. Each transition replaces the previous label. Override labels with `status-labels` (`state=label` lines). With `project` (`owner/number`), the issue is added to that GitHub Project and its single-select `project-status-field` (default `Status`) is set to the matching option: `project-status-options` maps states to option names (`state=Option name` lines, several states may share one option), and an unmapped state defaults to its Title Case name, for example `In review`. A state with no matching option leaves the field unchanged and is reported. Rules: [work-status.md](../shared/references/work-status.md).

## Triage

Every issue the flow creates or refines carries triage for metrics and future estimates: category labels, Priority, Effort, Start and Target date, Size, and Estimate, written to labels, GitHub Project fields, or organization issue fields as the profile's `## Triage` section names them (the issue field wins when a project field mirrors it). `business-refinement` sets the first values, `technical-refinement` revises them after the plan (splitting anything above the largest size), and `readiness-review` does not pass an issue with a required field missing. Estimates follow the Size scale and the history of similar closed work. Values people set change only when a refinement changes the scope, with a comment. Rules: [triage.md](../shared/references/triage.md).

## Profile

Run inputs override the repository profile `docs/ai/delivery.md` (or `profile`), which overrides the defaults. One profile serves every step: repository scope and code map, source tracker, milestone template, languages, status labels and Project, triage fields, base branch, branch templates, issue resolution, implement workflow, parallel limit, research sources, and free-text context. Template and the full input list: [delivery-profile.md](../shared/references/delivery-profile.md).

## Trackers

Jira sources are read and commented through whatever access the harness has, including the REST API with `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` already in the environment (never printed). Attachments and inline images are downloaded and read. See [tickets.md](../shared/references/tickets.md).
