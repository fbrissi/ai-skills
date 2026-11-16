---
name: pr-checks
description: >-
  Diagnose failing or stuck CI checks on a pull request: find the failing job
  and step, read the real error, separate code defects from CI-only,
  configuration, permission, and flaky failures, and report the cause, evidence,
  and fix for each. Read-only by default. Use when the user asks why checks,
  CI, or a pipeline failed on a PR, or to analyze PR checks.
---

# PR checks

Explain every failing check with evidence. A check's name and its last log lines are symptoms; the cause is the first error in the failing step.

## Inputs

- **PR**: a number or URL. Default: the PR of the current branch.
- **Fix**: only when the user asks to fix. Otherwise report and stop.

## 1. Collect evidence

GitHub: run `<skill-dir>/scripts/failed-checks.sh [<pr>] [-R owner/repo]` by its absolute path from the repository root (needs `bash`, `gh`, `jq`). For each failing check it prints the job, the failed step, and the log lines before each `##[error]`. It also prints:

- check runs created through the API, which have no Actions log: their output and details URL;
- failed workflow runs on the head commit that are not PR checks (for example a `workflow_dispatch` run that reports into a check run). These often hold the real cause of a failing API check.

Raise `--context` when the error needs more lines. `gh run view --log-failed` can show only cleanup steps, so prefer the script.

GitLab: `glab ci status`, then `glab ci trace <job-id>` for each failed job.

Pending checks: report what is still running, and whether a required check was never triggered (for example, skipped because the PR is a draft or the workflow is missing on the target branch).

## 2. Find the cause

For each failure:

1. Name the failing step and quote its first real error (at most a few lines), not the generic `exit code 1`.
2. Separate aggregate gates (a job that only fails because others failed) from root failures, and report the gate under its cause.
3. Classify it, using [references/ci-pitfalls.md](references/ci-pitfalls.md) for failures that pass locally:
   - **code**: the PR's change breaks a test, build, lint, or contract;
   - **ci-only**: the checkout, environment, or tooling differs from local (gitignored files, non-TTY output, versions, merge commit);
   - **config**: missing secret, variable, app installation, permission, or environment;
   - **flaky/external**: timing, network, rate limit, or provider outage; confirm with a rerun or history before calling it flaky;
   - **workflow**: the workflow file itself is wrong.
4. Reproduce locally with the narrowest command when it can run locally. Say when it cannot (secrets, hosted services).
5. Read the code or config the error points to before proposing a fix.

## 3. Fix (only when asked)

- **code**, **ci-only**, **workflow**: make the smallest fix, run the reproducing command again, then commit and push only if the user asked for it. To also handle review comments, use the `pr-fix` skill if it is installed; otherwise fix directly.
- **config**: never change repository settings, secrets, or app installations yourself. Give the exact setting and where to change it.
- **flaky/external**: rerun once with `gh run rerun <run-id> --failed` only when the user agrees, and report the result.

## Output

```text
PR #<n> checks: <failed> failed, <pending> pending, <passed> passed

1. <workflow / check> — <class>
   Step: <failing step>
   Error: <first real error line>
   Cause: <one or two sentences>
   Fix: <smallest fix, or the setting to change and who changes it>
   Reproduce: <local command | not reproducible locally: why>
...
Gates: <aggregate checks that fail only because of the items above>
```
