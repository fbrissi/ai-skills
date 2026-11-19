# Changelog

All notable changes to this project are documented here. Release versions follow
[Semantic Versioning](https://semver.org/).

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
