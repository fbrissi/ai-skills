# quality-cycle

Orchestrates review, QA, and fixes on a branch until both a code reviewer and QA approve: [`review-changes`](review-changes.md) and [`qa-e2e`](qa-e2e.md) (on [`bdd-scenarios`](bdd-scenarios.md) output) find issues, [`dev`](dev.md) fixes them, and the loop re-reviews and re-tests what changed plus regressions, up to a round limit. Keeps a cycle log and pushes once.

**Requires:** `git`; for QA, what [`qa-e2e`](qa-e2e.md) requires. Optional [project profile](../README.md#project-profiles) at `docs/ai/quality-cycle.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Target | branch to approve | current branch vs its base |
| Max rounds | number | profile, otherwise 3 |
| Push | "and push", "open a PR" | ask after both approve |
| Profile | path | `docs/ai/quality-cycle.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/quality-cycle/references/profile-template.md): round limit, base branch, cycle log folder, checks, triage policy, follow-up tracker, shipping preference.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/quality-cycle`, `/quality-cycle max 5 rounds and open a PR` |
| Codex CLI | `$quality-cycle feature/checkout` |
| OpenCode | "use the quality-cycle skill on this branch" |

## What it does

1. Records base and scope, makes sure scenarios cover the changed capabilities, and starts a cycle log (`docs/qa/cycles/<date>-<branch>.md`).
2. Each round, the **Reviewer** reviews the full diff against the base (never only the last commit) and runs tests; **QA** runs the scenarios (round 1: all in scope; later: failures, fix-affected scenarios, and a regression pass on touched areas).
3. Triage: blocker, critical, high, and medium are fixed in the cycle; lows are fixed only when cheap and in touched code; other lows and pre-existing issues become follow-up tickets; product decisions go to the user.
4. The **Developer** fixes root causes, applies the same fix to sibling code paths, adds tests, and commits locally without pushing.
5. Repeats until both approve in the same round, or escalates to the user at the round limit or when a round makes no progress.
6. Pushes once after approval (asking first unless told), optionally opening a PR via [`pr-create`](pr-create.md) or [`ship`](ship.md).

In a non-interactive run (CI) it never waits: anything that needs the user ends the cycle as escalated. QA in CI uses a real browser when a CI setup command can start the test environment; otherwise QA runs targeted validation (focused tests for the new behavior, the app or API started headless to exercise the changed endpoints or commands, smoke checks) and gives a normal verdict from that evidence, never escalated only for the missing E2E setup.

Reviewer and QA run as fresh, independent contexts when the harness can delegate; otherwise the skill switches roles explicitly. Every referenced skill has a fallback when not installed.

## Side effects

Local commits, a cycle log, QA reports. Push, PR, and follow-up tickets only as described above.
