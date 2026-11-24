# Agents

Claude Code agents built on the skills in this library, shipped as the `ai-skills` Claude Code plugin. Other harnesses use the skills directly; agents for them may come later.

## Install

In Claude Code:

```text
/plugin marketplace add fbrissi/ai-skills
/plugin install ai-skills@fbrissi
```

The plugin contains every skill too, so you do not need `npx skills add` for Claude Code. If you also installed the skills with `npx skills add`, Claude Code lists each skill twice (once as `ai-skills:<name>`); keep one of the two.

## Catalog

| Agent | Kind | What it does | Side effects |
| --- | --- | --- | --- |
| `code-reviewer` | Worker | Independent review with `review-changes`; never edits | PR review only when asked |
| `qa-tester` | Worker | Runs BDD scenarios in a browser with `qa-e2e` | QA reports, screenshots |
| `developer` | Worker | Implements a plan or fixes findings with `dev`; local commits | Code edits, local commits |
| `ci-investigator` | Worker | Diagnoses failing CI with `pr-checks`; read-only | None |
| `milestone-delivery` | Orchestrator | Per milestone issue: plan, implement, review and QA cycle, PR | Branches, commits, push, PRs, issue comments |
| `pr-shepherd` | Orchestrator | Takes an open PR to clean: review feedback, CI, review and QA cycle | Commits, push, PR replies |
| `incident-responder` | Orchestrator | Observability error to root cause, then questions or a fix PR, auto-fix, risk rating, optional merge | Tickets, branches, PRs, merge when allowed |
| `inpi-watch` | Orchestrator | RPI analysis to tracked issues with labels, owner, and due dates | Issues, labels, comments |
| `nfse-compliance` | Orchestrator | NFS-e technical note to estimated issues, implementation, PR, auto-fix, risk rating, optional merge | Issues, branches, PRs, merge when allowed |
| `business-analyst` | Delivery | Source ticket to a milestone with business issues, or questions on the source, with `business-refinement` | Milestone, issues, labels, source comment |
| `tech-lead` | Delivery | Technical plan per issue and safe parallel order, with `technical-refinement` | Issue plans, labels |
| `readiness-reviewer` | Delivery | Ready or back to refinement, with `readiness-review`; never edits bodies | Labels, comments |
| `delivery-orchestrator` | Orchestrator | Starts a milestone's unblocked issues up to a limit, with `delivery-orchestration`; opens the milestone PR | Branches, labels, workflow dispatches, PR |
| `task-implementer` | Orchestrator | One issue on its task branch: `dev`, `quality-cycle`, `pr-create` into the milestone branch | Commits, push, PR, labels |

```text
milestone-delivery ─┐
pr-shepherd        ─┤                  ┌─► developer
incident-responder ─┼─ delegate to ────┼─► code-reviewer
inpi-watch         ─┤                  ├─► qa-tester
nfse-compliance    ─┤                  └─► ci-investigator
task-implementer   ─┘

delivery-orchestrator ─► task-implementer (local) | implement workflow (CI)
```

**Workers** run as subagents. Claude Code picks them by description, or you ask for them by name ("use the code-reviewer agent on this branch"). `quality-cycle` delegates its Reviewer, QA, and Developer roles to them when they are installed.

**Orchestrators** delegate to the workers. A subagent cannot start other subagents, so run an orchestrator as the main agent:

```bash
claude --agent ai-skills:milestone-delivery
```

For scheduled or CI runs, run it non-interactively. It then never waits for input: questions go to the issue or PR, and that item stops there.

```bash
claude -p --agent ai-skills:inpi-watch "process the latest RPI"
```

Started as a subagent instead, an orchestrator plays the roles itself one at a time, as `quality-cycle` describes.

## Orchestrators

### milestone-delivery

Loads the milestone's open issues, skips the ones assigned to others or already in a PR, orders the rest by dependency and priority, and asks once for approval of the plan. For each issue: `ticket-plan`, a branch, `developer`, `quality-cycle` until `code-reviewer` and `qa-tester` approve, then `pr-create` with `Closes #<n>`. One PR per issue; dependent issues get stacked branches. Never merges. Say "and watch the PRs" to run the `pr-shepherd` loop on each one.

### pr-shepherd

Each round: `pr-fix` on the review comments and CI (in `review` mode it asks before the first push and before replying), then `quality-cycle` on the PR branch, then the `pr-fix` watch loop until CI settles. Repeats while new feedback arrives, up to the round limit. Never merges. With Settle `none` it does one round and finishes with `awaiting events` instead of watching, for a CI workflow that reacts to review events and starts the next run.

### incident-responder

Runs `observability-triage`. A high-confidence code defect goes to a fix: ticket, `fix/` branch, failing test first, `quality-cycle`, `pr-create`, then the `pr-shepherd` loop in `auto` mode until a person approves, then `merge-risk` in `decide` mode. Anything less certain becomes questions (interactive) or a ticket with the questions (non-interactive). Configuration, dependency, and data causes become a ticket for the owner; it never touches infrastructure or production data. Re-running it resumes from the existing ticket or PR.

### inpi-watch

Runs `inpi-trademark-watch` for each RPI, then creates or updates `INPI: RPI <n>` with category and urgency labels, the owner, and the earliest deadline as the due date. Optionally one issue per action. When a new dispatch settles or changes an earlier action, it comments on the earlier issue, and closes it only when the profile allows. Never files anything with INPI.

### nfse-compliance

In `scan` mode it finds notes with no issue yet. For each note: `nfse-technical-note-analysis`, then an issue with category labels (tax, layout, API, events, DANFSE, validation), estimates, priority, and due dates from the official dates and rollout plan. Not-applicable notes are recorded and closed. Issues go to the milestone the profile's milestone policy names (a release milestone for deadline work, a tracking milestone for watched work). On resume it reconciles an existing issue with the current profile and sources first, so a policy change fixes old issues instead of duplicating them. Required changes are implemented homologation first on `feat/nfse-nt-<n>-<slug>`, go through `quality-cycle` and `pr-create`, then the `pr-shepherd` loop in `auto` mode until a person approves, then `merge-risk` in `decide` mode. With the profile's `PR follow-up: events`, it handles the feedback already on the PR in one pass and stops with `awaiting review`; a CI workflow that reacts to review events runs it again, and a run on an approved PR goes on to the merge decision. It never deploys.

### Delivery flow

`business-analyst`, `tech-lead`, `readiness-reviewer`, `delivery-orchestrator`, and `task-implementer` run one step each of the [delivery flow](delivery-flow.md): business refinement, technical refinement, readiness review, orchestration, and implementation. Each step is its own non-interactive run, usually started by a workflow, and moves issues through the `status:*` labels. The first three only change issues; they follow their skill and stop if it is not installed.

`delivery-orchestrator` never codes. In CI it dispatches the implement workflow for each unblocked issue, up to `max-parallel`, and exits; it is re-run when a task PR merges into the milestone branch. Locally it delegates each task to `task-implementer`, or plays that role itself one task at a time when it cannot start subagents. When every issue is done it opens the milestone PR.

`task-implementer` checks out the task branch, implements the issue with `developer`, runs `quality-cycle` with `code-reviewer` and `qa-tester` until both approve, opens a PR into the milestone branch with `pr-create`, and marks the issue `in-review`. The PR follow-up (`pr-shepherd` or `pr-fix`, then the repository's merge process) is a separate run. None of these agents merges.

```bash
claude -p --agent ai-skills:delivery-orchestrator "milestone JIRA:ABC-123 max-parallel 2"
```

## Auto-merge

`incident-responder` and `nfse-compliance` can merge their own PRs. Both stop before merging unless every condition holds:

1. **Auto-merge is on.** It is off by default. Turn it on, or off again, per agent in its profile's Automation section (`docs/ai/observability-triage.md` and `docs/ai/nfse-technical-note-analysis.md`), or for one run in the request ("no merge", "auto-merge on"). Missing values fall back to `docs/ai/merge-risk.md`.
2. **A person approved the PR** on the current head commit (`Required human approvals`, default 1), CI is green, and no review thread is open.
3. **The risk rating is within the limit** (`Max risk to merge`, default 2), after the profile's risk floors.

The `merge-risk` skill posts its assessment on the PR every time, merged or held. Merges never use admin rights or bypass branch protection, so branch protection remains the final safeguard.

## Profiles

The agents read the profiles of the skills they use:

| Agent | Profiles |
| --- | --- |
| `milestone-delivery`, `pr-shepherd` | `quality-cycle`, `review-changes`, `qa-e2e`, `bdd-scenarios` |
| `incident-responder` | `observability-triage` (Automation section), `merge-risk`, plus the cycle profiles |
| `inpi-watch` | `inpi-trademark-watch` (Automation section) |
| `nfse-compliance` | `nfse-technical-note-analysis` (Automation section), `merge-risk`, plus the cycle profiles |
| `business-analyst`, `tech-lead`, `readiness-reviewer`, `delivery-orchestrator` | `delivery` (`docs/ai/delivery.md`) |
| `task-implementer` | `delivery`, plus the cycle profiles |
