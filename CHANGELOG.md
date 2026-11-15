# Changelog

All notable changes to this project are documented here. Release versions follow
[Semantic Versioning](https://semver.org/).

## v0.1.0

### Added

- Add 11 harness-agnostic skills: `learn`, `skill-authoring`, `ticket-plan`, `ticket-ask`, `ticket-create`, `pr-create`, `pr-fix`, `review-changes`, `dev`, `ship`, and `todo`, adapted from the Kompass command set.
- Add `pr-context.sh`, which loads a pull request's metadata, checks, reviews, comments, and open threads in one GraphQL call.
- Install and update with the `skills` CLI (`npx skills add fbrissi/ai-skills`, `npx skills update`), with Rulesync sources as an alternative.
- Commit the generated `AGENTS.md` and `CLAUDE.md` so agents get the repo guidance from a plain checkout.
- Add Quality Checks, Code Review (using the `review-changes` skill), and CHANGELOG-driven release workflows.
