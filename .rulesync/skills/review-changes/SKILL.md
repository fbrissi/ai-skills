---
name: review-changes
description: >-
  High-signal code review of local changes, a branch, or a pull request, with a
  1-5 star grade and severity-ranked findings. Reports locally by default; can
  publish a formal PR review with inline comments when asked. Use when the user
  asks to review changes, a diff, a branch, or a PR.
---

# Review changes

Report only material defects you can explain with a concrete failure mode. Fewer, stronger findings beat many speculative ones.

## Inputs

- **Target**: `uncommitted`, a base branch (e.g. `main`), or a PR number/URL. Default: uncommitted changes if there are any, otherwise the current branch against its base.
- **Publish**: only when the user explicitly asks to post or publish the review (PR targets only).
- **Focus**: any remaining text sets priority areas.

Never switch branches or move `HEAD` during a review. If the content you need is not available locally, report that as a blocker.

## 1. Load scope

| Target | Commands |
| --- | --- |
| uncommitted | `git status --short`; `git diff HEAD --stat`; `git diff HEAD -- <path>` |
| branch | base = the given branch or `git symbolic-ref --short refs/remotes/origin/HEAD`; `git log --oneline <base>..HEAD`; `git diff --stat <base>...HEAD` |
| PR | `<skill-dir>/scripts/pr-context.sh <pr> --all-threads` (absolute path, run from the repo root; needs `bash`, `gh`, `jq`); then `git fetch origin <pr.base> pull/<n>/head` (works for forks too) and diff `origin/<pr.base>...FETCH_HEAD`, reading PR files with `git show FETCH_HEAD:<path>` (or use `gh pr diff <n>`). If the PR head is already checked out, diff against `HEAD` instead |

For a PR whose body links exactly one ticket, load it with `references/tickets.md` and judge whether the PR meets the ticket's intent.

## 2. Read before judging

1. Load the nearest `AGENTS.md`/`CLAUDE.md` for the changed paths. Their rules are binding review criteria.
2. Read each changed file in full (or the full changed functions in very large files). Hunks alone are not enough. For deleted files use `git show <base>:<path>`.
3. Skip lockfiles, generated output, and bulk formatting unless they hide real changes.
4. Look beyond the changed files only to confirm a suspected issue, such as a caller that breaks.
5. If the change set is too big for one pass, split it by area and use subagents if the harness has them, after the file list is known.

## 3. What counts

Correctness and logic regressions · missing error/edge handling · security, auth, privacy, data loss · API/schema/migration/back-compat breaks · concurrency, retry, caching, state bugs · partial updates (one call site changed, another missed) · stale references after renames/deletes · null/empty/default/timeout/ordering assumptions · violations of repo guidance.

Not findings: style, naming, or "consider refactoring" unless it hides a real defect.

Severity: `critical` (data loss, security, broken deploy) · `high` (likely bug in normal use, broken contract) · `medium` (edge-case bug, likely follow-up breakage) · `low` (non-blocking; mention, never publish).

## 4. PR-specific stability rules

- Already settled, so do not re-raise: resolved threads; threads where the author explained a decline/deferral; concerns the author explicitly declined in comments, unless the new diff adds a materially different failure mode.
- Prior reviews by `viewer` are your baseline. Add new findings only for new diff content or a clearly missed material defect, and say which.
- Verify bot and human claims alike. Do not repeat a claim just because someone made it.

## 5. Grade

`★★★★★` means no material findings. Any lower grade must be justified by at least one finding.

## 6. Publish (PR + explicit request only)

- **5 stars**: `gh pr review <n> --approve` (skip if `viewer` already approved `pr.headSha`). If approving fails (for example on your own PR), fall back to `gh pr review <n> --comment --body "★★★★★"`.
- **Below 5**: submit **one** review with every inline comment in a single API call:

```bash
gh api repos/<o>/<r>/pulls/<n>/reviews --input "$tmp/review.json"   # tmp=$(mktemp -d)
# review.json: {"commit_id":"<pr.headSha>","event":"COMMENT","body":"★★★☆☆\n<non-inline notes>",
#   "comments":[{"path":"a.ts","line":42,"side":"RIGHT","body":"..."},{"path":"b.ts","start_line":10,"line":14,"body":"..."}]}
```

Inline comments only work on lines inside the diff hunks. Put anything else in the body as `path:line - issue`. Use `"side":"LEFT"` for deleted lines. Write `review.json` to a temp directory, never the working tree, and delete it afterwards.

## Output

```text
Review: <scope>
Grade: <★★★☆☆>   Verdict: <one line>
Findings: <n> (<c> critical, <h> high, <m> medium, <l> low)

1. [high] path:line - failure mode. Smallest fix: ...
...
Published: <review URL | approved | not published>
```
