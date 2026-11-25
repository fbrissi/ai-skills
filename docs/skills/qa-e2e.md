# qa-e2e

Runs BDD scenarios end to end against a running test environment, in a real browser, as a user would. Checks functional behavior, UX/UI at desktop and mobile viewports, console and network health, and e-mail flows through a local mail catcher. Writes a report with screenshots and an **APPROVED** or **CHANGES REQUIRED** verdict for a developer.

**Requires:** a browser automation capability in the harness, a running local or staging stack, and a [project profile](../README.md#project-profiles) at `docs/ai/qa-e2e.md` (or answers to a few questions).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Scope | feature files, tags (`@smoke`, `@p1`), a capability, a branch, or `all` | scenarios covering the current branch, otherwise `@smoke` |
| Environment | `local`, a staging or preview URL you name, or `ci` | `local` (`ci` when `CI=true`) |
| Profile | path | `docs/ai/qa-e2e.md` |
| Focus | free text (e.g. "mobile only") | none |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/qa-e2e/references/profile-template.md): URLs, start and reset commands, CI setup command and browser tool, scenarios folder, test account source, mail catcher, payment and CAPTCHA test modes, viewports, report folder, known console noise.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/qa-e2e @smoke`, `/qa-e2e main mobile only` |
| Codex CLI | `$qa-e2e team/invite-teammate.feature` |
| OpenCode | "use the qa-e2e skill on this branch against local" |

## What it does

1. Checks the stack and mail catcher are up, loads the scenarios in scope (asking [`bdd-scenarios`](bdd-scenarios.md) for them when missing), and prepares test data with the profile's commands.
2. Runs each scenario at the desktop viewport (default 1440x900), recording pass, fail, or blocked, plus console errors and failed requests. E-mail steps open the mail catcher and follow the link.
3. Switches to the mobile viewport (default 375x812) on each distinct screen, `@mobile` scenario, and changed screen, and checks layout, overflow, touch targets, keyboard and focus, contrast, and loading, empty, and error states.
4. Optionally runs one short exploratory charter on the riskiest change.
5. Writes `docs/qa/reports/<date>-<scope>.md` with a pass/fail summary, findings (steps, expected vs actual, viewport, severity, screenshot, scenario reference), and the verdict.

In CI it runs the profile's `CI setup` command (or the caller's) to install the browsers (Playwright, or Selenium) and start the stack. It tests only what the task changed (the scenarios covering the diff plus the `@smoke` scenarios of the touched areas) and writes scenarios for new behavior first. Without a setup command, or when the environment does not come up, it runs targeted validation: focused tests for the changed behavior (written when the caller allows it, otherwise reported as gaps), the app or API started headless to exercise the changed endpoints or commands, and the framework's smoke checks, with an APPROVED or CHANGES REQUIRED verdict from that evidence.

Safety: test environments and test credentials only, no production writes, no real payments, no CAPTCHA bypass (uses the provider's test keys). It reports; it does not fix code.

Optional companions, each with a built-in fallback: `webapp-testing` (Playwright toolkit), `web-design-reviewer` (visual and responsive review), `exploratory-testing` (charters).

## Side effects

Writes a report and screenshots. Uses and may reset test data on the test environment.
