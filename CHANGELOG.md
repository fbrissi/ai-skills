# Changelog

All notable changes to this project are documented here. Release versions follow
[Semantic Versioning](https://semver.org/).

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
