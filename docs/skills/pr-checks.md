# pr-checks

Diagnoses failing or stuck CI checks on a pull request. For each failure it finds the failing job and step, quotes the first real error, classifies the cause (code, CI-only, config, flaky/external, workflow), and gives the fix. Read-only unless you ask it to fix.

**Requires:** `bash`, `gh` (authenticated), and `jq`. On GitLab, `glab`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| PR | number or URL | PR of the current branch |
| Fix | say "fix it" | report only |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/pr-checks`, `/pr-checks 42`, `/pr-checks 42 and fix it` |
| Codex CLI | `$pr-checks https://github.com/acme/app/pull/42` |
| OpenCode | "use the pr-checks skill on PR 42" |

## What it does

1. Runs `scripts/failed-checks.sh`, which prints each failing check's job, failed step, and the log lines before every `##[error]`. It also reads check runs created through the API and failed runs on the head commit that are not PR checks, such as a dispatched review workflow.
2. Reports aggregate gate jobs under their root failure instead of as separate causes.
3. Uses `references/ci-pitfalls.md` for failures that pass locally: gitignored outputs, colored output without a TTY, merge commits, fork secrets, missing app installations, version and OS differences.
4. Reproduces locally with the narrowest command when possible.
5. When asked to fix: fixes code, CI-only, and workflow causes; for configuration it names the exact setting instead of changing it. Hands off to `pr-fix` when review comments also need handling.

## Side effects

None unless a fix was requested. It never changes repository settings or secrets, and reruns a job only with your agreement.
