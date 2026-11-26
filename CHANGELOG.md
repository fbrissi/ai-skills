# Changelog

All notable changes to this project are documented here. Release versions follow
[Semantic Versioning](https://semver.org/).

## v0.8.0

### Added

- `dependency-updates` skill: brings a repository's open Dependabot (or Renovate) PRs, and optionally outdated packages up to a level, into one branch and one PR. Per package it reads the release notes and upgrade guide, lists the breaking changes that apply, adapts the affected code with `dev`, and holds back what cannot be adopted safely with a reason; then it runs the project's checks and `quality-cycle`, writes the release notes the repository's rules ask for, and opens the PR with `pr-create`, listing packages, breaking changes and their handling, held packages, checks, QA, and `Supersedes #<n>` for each bot PR. A later run updates the open PR of an earlier one (marker `<!-- ai-dependency-updates -->`) instead of opening another. It never closes or merges bot PRs. Profile `docs/ai/dependency-updates.md` (ecosystems, bots, outdated level, base branch, branch template `chore/dependency-updates-{date}`, labels, never-update and hold lists, extra validation).
- `dependency-updater` agent: runs `dependency-updates` with `developer`, `code-reviewer`, and `qa-tester`, opens or updates the one PR, and stops; the PR follow-up (`pr-fix`, merge decision) takes over. A separate agent rather than an `issue-resolver` mode, because there is no issue, severity, or branch-type decision.
- `docs/delivery-flow.md` describes the weekly dependency update path next to issue resolution.
- This repository runs the flow on itself: `.github/workflows/ai-dependency-update.yml` (Monday 15:00 UTC, after Dependabot, plus manual runs) with the profile `docs/ai/dependency-updates.md`. It skips while the `AGENT_APP_CLIENT_ID` variable is empty and stops at the PR (no PR follow-up workflows here).

### Changed

- Updated `rulesync` from 43.8.2 to 43.11.0 (supersedes Dependabot PR #11). The releases in between add targets and permission and hook fixes this repository does not use; `npm run generate` produces identical outputs.

## v0.7.0

### Added

- `delivery-orchestration` writes the release notes when every issue of a milestone is done: a new section at the top of the profile's `Release notes file` (heading from `Release heading`, version from `Release version`: the milestone name or the next patch, minor, or major version) that summarizes the merged task PRs, plus the `Version files`. Release branches take changes only through PRs, so the notes go in their own PR from `Release notes branch template` (default `feature/{release-slug}-release-notes`) into the release branch, which follows the task PR follow-up; the milestone PR is marked ready only after it merges. New `## Release notes` section in the delivery profile template; without `Release notes file` nothing changes.

### Fixed

- `delivery-orchestration` and `delivery-orchestrator` stop at a failed push, PR command, or dispatch instead of moving statuses and dispatching past it.
- `task-implementer` runs the reviewer and QA for every change, documentation included, tells QA when the caller already started the test environment, and sets the Project status field with every status label move.
- `docs/delivery-flow.md` describes the send-back limit (3 per milestone) next to the loop guard.

## v0.6.0

### Added

- Delivery flow: four skills that take a source ticket to reviewed PRs, each a separate non-interactive run. `business-refinement` turns a Jira ticket, GitHub issue, or GitHub milestone into a milestone with business-level issues, or comments the open questions on the source in its language. `technical-refinement` writes a technical plan per issue with `ticket-plan` and makes the milestone safe to build in parallel (disjoint areas or explicit dependencies, splits and merges). `readiness-review` moves each issue to ready or back to refinement with a reason. `delivery-orchestration` creates the milestone and task branches, starts unblocked issues up to `max-parallel` (dispatching the implement workflow in CI), and opens the milestone PR when every issue is done. See `docs/delivery-flow.md`.
- Delivery agents: `business-analyst`, `tech-lead`, `readiness-reviewer`, `delivery-orchestrator`, and `task-implementer` (`dev`, `quality-cycle`, and `pr-create` into the milestone branch). None of them merges.
- OpenCode agents: every agent is also generated as an OpenCode agent in `plugins/ai-skills/opencode/agent/<name>.md` (Rulesync `opencodev1` target, copied by `scripts/copy-opencode-agents.sh` in `npm run generate` and checked by `npm run check`), with the same body, `mode: all` so it runs as the main agent (`opencode run --agent <name>`) or as a subagent, no model, and `permission.edit: deny` for the read-only agents. `.opencode/` is gitignored.
- Shared `work-status` reference: one `status:<state>` label per issue, configurable labels, and the matching GitHub Project single-select field with configurable option names (`project-status-options`).
- One shared delivery profile, `docs/ai/delivery.md`, with the flow's inputs and defaults, including a `## Triage` section.
- `issue-resolver` agent: `intake` reads a source skill and keeps one deduplicated GitHub issue per source item, with a severity label from the delivery profile's hotfix criteria and the resolve label (`ai:resolve`); `resolve` fixes one issue on a hotfix branch into the default branch or a bugfix branch into the open release branch, runs the review and QA cycle, opens the PR, and stops. It never waits for approval and never merges.
- `sentry-issues` skill: lists unresolved Sentry issues with profile filters (projects, environment, period, minimum events and users, limit), reads events and in-app stack traces, writes tracker issue bodies with the dedupe marker `<!-- ai-issue source=sentry id=<id> -->`, and marks an issue resolved after merge when allowed. Credentials from `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and optional `SENTRY_BASE_URL`.
- Shared `non-interactive` reference: in CI (`CI` or `GITHUB_ACTIONS`) or when a caller says so, no skill asks or waits; each question point uses its non-interactive default or posts one blocker comment that mentions the requester and says to reply `/ai-resume` (optionally with instructions) where the resume workflow runs. Used by `dev`, `pr-create`, `qa-e2e`, `ticket-plan`, `pr-fix` (`auto` in CI), `quality-cycle`, `ship`, `todo`, `work-cleanup`, `observability-triage`, `sentry-issues`, and the orchestrator agents.
- Every issue the delivery flow creates or refines carries triage: `business-refinement` sets category labels, Priority, Start and Target date, and an initial Size, Estimate, and Effort; `technical-refinement` revises them after the plan and splits anything above the largest size; `readiness-review` sends an issue with missing triage back to technical refinement; `delivery-orchestration` starts issues by Priority and Target date.
- Mermaid diagrams in the docs: the delivery flow, stage chaining and `/ai-resume`, the branch model, the task PR follow-up, issue resolution, and the status labels in `docs/delivery-flow.md`; agent delegation, the skills each agent follows, and the `quality-cycle` loop in `docs/claude-code-agents.md`.

### Changed

- Ticket access gains the tracker's REST API with credentials already in the environment (for Jira `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) before the public URL option: read, comment, labels, and attachments, never printing the credentials.
- Triage reference covers Size, Effort, and Start and Target dates, a Size to Estimate scale, estimates from the history of similar closed work, GitHub Project fields and organization issue fields (the issue field wins when a project field mirrors it), and never overwrites values people set unless the scope changed, with a comment.
- `dev` can track the issue's status (`in-progress`, `in-review`) when a caller asks for it.
- Delivery steps leave a state a workflow can chain on: one status label per issue in scope, a blocker comment starting with `<!-- ai-delivery blocker stage=<stage> -->` and `Blocked: <line>` per blocked item, and a `Blocked:` list in each output. `task-implementer` never exits with the issue `in-progress`: an escalated cycle opens the PR labeled `ai:needs-human` (issue `in-review`), and an unclear requirement moves the issue to `technical-blocked`.
- `requested-by` input across the delivery flow, recorded in the milestone description as `<!-- ai-delivery requested-by=<login> -->`, used as assignee and milestone PR reviewer, and passed on to dispatched workflows that declare it.
- `business-refinement` with a GitHub milestone source treats the milestone's existing issues as the request and reorganizes them in place (rewrite with the original kept, retitle, split, merge); a blocked Jira source without a GitHub issue gets a tracking issue `JIRA:<key> - business refinement`; issues get an `## Attachments` section with each attachment's URL and a text description. Technical refinement splits or merges only for code reasons and downloads listed attachments.
- `delivery-orchestration` opens the milestone PR early as a draft that aggregates the task PRs, keeps its body current, marks it ready (requesting `requested-by`) when every issue is done, and after it merges moves every issue to `done` and closes the milestone.
- QA in CI: `qa-e2e`, `quality-cycle`, `qa-tester`, and `task-implementer` use a real browser on the scenarios for what the task changed when a CI setup command starts a test environment (new `QA in CI setup` and `QA browser` delivery profile lines, `CI setup` and `Browser tool` in the `qa-e2e` profile), and otherwise run targeted validation (focused tests for the new behavior, the app or API started headless to exercise the changed endpoints or commands, framework smoke checks) with a normal verdict from that evidence, never escalating only because there is no E2E setup.
- Branch model: release, feature, hotfix, and bugfix branches named by delivery profile templates (`Release branch template` default `release/{slug}`, `Feature branch template` default `feature/{release-slug}-{n}-{slug}`, `Hotfix branch template` default `hotfix/{slug}`, `Bugfix branch template` default `bugfix/{slug}`, plus `Bugfix release branch`). The milestone branch is the release branch; bugfix PRs target the open release branch (the oldest one when the profile names none, a blocker when there is none). No skill or agent hardcodes `feat/` or `fix/` anymore (`delivery-orchestration`, `milestone-delivery`, `nfse-compliance` with a new `Branch template` line, `ship`), and existing branches under older names are reused, never renamed. `work-cleanup` also protects `hotfix/*`.
- `merge-risk`: a `Base branches` list (exact names or patterns, or a caller-provided list) replaces the single base branch; an optional per-base table sets `Max risk to merge` and `Required human approvals` per base pattern; with 0 required approvals an empty review decision passes (only changes requested, or a review required by branch protection, holds), otherwise human approvals on the head commit are counted from the reviews, never from the review decision alone.
- Resume: handoffs and blocker comments tell the reader to reply `/ai-resume` (optionally with a stage and instructions) instead of ticking a checkbox. `docs/delivery-flow.md` documents the command, the per-run `instructions` input, the branch model, and issue resolution.
- `incident-responder` is now a deprecated alias of `issue-resolver`: it diagnoses with `observability-triage` and resolves a code defect through a GitHub issue and a PR, and no longer watches the PR or merges. The `observability-triage` profile drops its Automation section; fix automation lives in the delivery profile.
- `pr-create` and `ticket-create` take an assignee and skip `--assignee @me` with a GitHub App or bot token, where it fails. Ticket access maps Jira inline images to attachments with `expand=renderedFields`.
- Ticket skills (`ticket-ask`, `ticket-plan`, `ticket-create`, `dev`, `pr-create`, `review-changes`) download and read ticket attachments and inline images instead of skipping them: through the tracker's download action, including one an MCP server exposes only through discovery (such as the Atlassian server's Jira attachment download), then a tracker CLI or the REST API with credentials from the environment. Files go to a temp directory, are never executed, and are deleted afterwards.
- `pr-shepherd` takes a `Settle` input: `wait` (default) watches CI and new comments as before; `none` does one round and finishes with `awaiting events`, for event-driven runs started by a CI workflow that reacts to review events.
- `nfse-compliance` reads `PR follow-up` from the profile: `agent` (default) keeps the watch loop; `events` handles the feedback already on the PR once with `pr-shepherd` (Settle `none`) and stops with `awaiting review`. A resumed run on an approved PR still goes on to the merge decision.
- The `nfse-technical-note-analysis` profile template gains the `PR follow-up` Automation value, and `pr-fix` notes that `auto` mode suits event-driven runs.

## v0.5.0

### Added

- `work-cleanup` skill: after work is finished, lists the branches, worktrees, and optionally remote branches it left behind, classifies each as safe to remove or keep with a reason (protected, current, open PR, uncommitted changes, unpushed or unmerged commits), and deletes only the items the user confirms, never by force. Remote branches and `git branch -D` items are confirmed separately.

## v0.4.1

### Changed

- `nfse-compliance` reconciles an existing issue with the current profile and official sources before resuming it (decision, labels, estimate, due date, milestone), follows the profile's milestone policy (release milestone for deadline work, tracking milestone for watched work), and implements required changes from any source item the profile lists as implementable, not only technical notes.
- `nfse-compliance` searches open PRs and issues for the same change before branching, so two items about one change never open two PRs, and may prepare a production switch before the official date, which the merge decision holds until that date as a hard gate. A resumed issue is only reconciled, never re-created. Its report counts reconciled issues.
- The `nfse-technical-note-analysis` profile template gains the `Milestone policy`, `Awaiting-answer label`, and `Implementable sources` Automation values.

## v0.4.0

### Added

- Claude Code plugin `ai-skills` (`/plugin marketplace add fbrissi/ai-skills`, then `/plugin install ai-skills@fbrissi`) with every skill and nine agents, generated by Rulesync from `.rulesync/subagents/`.
- Worker agents: `code-reviewer`, `qa-tester`, `developer`, and `ci-investigator`.
- Orchestrator agents: `milestone-delivery` (milestone issues to reviewed and QA-approved PRs), `pr-shepherd` (open PR to approval), `incident-responder` (observability error to root cause, questions or a fix PR, optional merge), `inpi-watch` (RPI to tracked issues with labels and deadlines), and `nfse-compliance` (NFS-e technical note to estimated issues, implementation, PR, optional merge).
- `observability-triage` skill: traces a production error from Sentry, Datadog, or another tool to its root cause, with confidence and a recommendation. Read-only.
- `merge-risk` skill: rates a PR's production risk 1-5, checks the merge gates, and merges only when auto-merge is on, a human approved, and the rating is within the limit.
- `ticket-create` and `ticket-plan` set triage fields (estimate, category, priority, due date) when asked, per tracker.

### Changed

- `quality-cycle` delegates its Reviewer, QA, and Developer roles to the `code-reviewer`, `qa-tester`, and `developer` agents when they are installed.
- The `inpi-trademark-watch` and `nfse-technical-note-analysis` profile templates gain an Automation section read by their agents.

## v0.3.3

### Added

- `review-changes` loads a security and privacy reference when a change touches authentication, tokens, permissions, tenancy, personal data, secrets, storage, or retention. It covers access policy, account enumeration through status or timing, tenant filters on every query, secrets and personal data in logs and responses, LGPD purpose and retention for new data, deletion reach, and injection.

## v0.3.2

### Changed

- `review-changes` supports cumulative coverage for PRs too large for one pass: partial reviews publish `Covered:` / `Not covered:` lines and never approve, later passes read only the uncovered areas, and the PR is approved once the passes together cover every changed file with no unresolved finding. Output gains a `Coverage:` line.

## v0.3.1

### Changed

- `quality-cycle` keeps scenarios that QA marks `blocked` for lack of user input (credentials, certificates, devices) open until a fresh, delegated QA run executes them after the user provides what is missing; the orchestrator only performs the step that needs the user. The cycle no longer finishes with blocked scenarios in scope unless the user accepts it.
- `quality-cycle` requires scheduled jobs, queue consumers, and their e-mails to be triggered on purpose, and the profile template gains a `Scheduled job triggers` field.

## v0.3.0

### Added

- Add `bdd-scenarios`, which maps an application's features from its routes, views, API, docs, and tests and writes Gherkin feature files with priority, role, viewport, e-mail, and sandbox tags, a coverage matrix (feature × scenario × role), and an unmapped list for owner input.
- Add `qa-e2e`, which runs BDD scenarios in a real browser against a local or named staging environment, reviews UX/UI at desktop and mobile viewports, follows e-mail links through a local mail catcher, and writes a report with screenshots and an APPROVED or CHANGES REQUIRED verdict. Test environments and test credentials only.
- Add `quality-cycle`, which loops review (`review-changes`) and QA (`qa-e2e`) with developer fixes (`dev`) until both approve or a round limit escalates to the user, with full-diff reviews, sibling-path fixes, triage of lows into follow-ups, a cycle log, and a single push. Every referenced skill has a fallback.

## v0.2.0

### Changed

- Ticket handling is provider-agnostic: skills detect tracker URLs, `Closes ABC-123`-style keys, and branch-name keys (`feature/dev-420-x` -> `DEV-420`), then use whatever access exists, in order: an MCP server or connector, a project or harness tool, an authenticated CLI, or a public URL.
- `review-changes` no longer stops when a referenced ticket cannot be loaded. It reviews the diff alone, notes the missing ticket in its output and published review, and keeps the `Published:` line contract. Ticket skills (`ticket-ask`, `ticket-plan`, `ticket-create`, `dev`, `pr-create`) still stop and say which access is needed.

### Security

- Run the dependency audit through `scripts/audit-high.mjs`, which fails on high or critical advisories (or when the audit cannot complete) except dated entries in `audit-allowlist.json`. Allow the unpatched `picomatch` ReDoS advisory (GHSA-fc5q-39xc-vjpf), reachable only through dev tooling, until 2026-12-31.

## v0.1.1

### Changed

- Move the Code Review, release-note check, and release workflows to the shared reusable workflows in [`fbrissi/github-actions@v1`](https://github.com/fbrissi/github-actions). `code-review.yml`, `release.yml`, and `release-orchestrator.yml` are now thin callers; the review still uses the `review-changes` skill from the pull request's base commit.
- Dispatch Code Review on `main` instead of the pull request branch, so a pull request can no longer change its own reviewer workflow and open pull requests use the current review setup without a rebase.

## v0.1.0

### Added

- Add 11 harness-agnostic skills: `learn`, `skill-authoring`, `ticket-plan`, `ticket-ask`, `ticket-create`, `pr-create`, `pr-fix`, `review-changes`, `dev`, `ship`, and `todo`, adapted from the Kompass command set.
- Add `pr-checks`, which diagnoses failing PR checks (failing step, real error, cause class, fix) with `failed-checks.sh`, including dispatched runs and API check runs.
- Add `inpi-trademark-watch`, which analyzes an INPI RPI Marcas issue for a watched trademark and bundles `check-inpi-rpi.rb` to download issues.
- Add `nfse-technical-note-analysis`, which maps an NFS-e Nacional technical note to code changes and a homologation-first rollout plan.
- Add `flow-video-ad`, which plans a Google Flow ad with real screen footage and assembles the final video.
- Add project profiles (`docs/ai/<skill>.md`) so domain skills read project-specific values instead of hardcoding them.
- Add `pr-context.sh`, which loads a pull request's metadata, checks, reviews, comments, and open threads in one GraphQL call.
- `review-changes` ends with a stable `Published:` line, including `skipped (...)` values, so automation can tell a deliberate skip from a failure.
- Install and update with the `skills` CLI (`npx skills add fbrissi/ai-skills`, `npx skills update`), with Rulesync sources as an alternative.
- Commit the generated `AGENTS.md` and `CLAUDE.md` so agents get the repo guidance from a plain checkout.
- Add Quality Checks, Code Review (the `review-changes` skill run by OpenCode or Claude Code, picked with `AI_HARNESS`), and CHANGELOG-driven release workflows.
