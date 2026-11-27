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

For a PR that clearly references exactly one ticket (body, title, or branch name; see `references/tickets.md`), load it (with its parent issue as context, as `references/tickets.md` says under Parent and sub-issues) and judge whether the PR meets the ticket's intent and **each of its acceptance criteria** (the `## Acceptance criteria` checklist when present): a criterion the diff does not meet, or meets only in part, is at least a `medium` finding that quotes the criterion, never a low or a follow-up. A criterion only a person can satisfy (a sign-off, such as "a person reviews the legal text before merge") is not a diff finding: the PR carries `ai:needs-approval` for it, so note it once in the review and judge the rest. Open every image of the ticket yourself (its `Images in every stage` section), not their description. If no access can load it, continue: review the diff on its own merits, skip the intent judgement, and add the `Ticket:` line below to the output and to any published review body. Never wait for input about ticket access, and never let it block publishing.

## 2. Read before judging

1. Load the nearest `AGENTS.md`/`CLAUDE.md` for the changed paths. Their rules are binding review criteria.
2. Read each changed file in full (or the full changed functions in very large files). Hunks alone are not enough. For deleted files use `git show <base>:<path>`.
3. Skip lockfiles, generated output, and bulk formatting unless they hide real changes.
4. Look beyond the changed files only to confirm a suspected issue, such as a caller that breaks.
5. If the change set touches authentication, sessions, tokens, permissions, tenancy, personal data, secrets, storage, or retention, load `references/security-privacy.md` and answer its questions for the touched areas.
6. If the change set is too big for one pass, split it by area and use subagents if the harness has them, after the file list is known.

## 3. What counts

Correctness and logic regressions · missing error/edge handling · security, auth, privacy, data loss · API/schema/migration/back-compat breaks · concurrency, retry, caching, state bugs · partial updates (one call site changed, another missed) · stale references after renames/deletes · null/empty/default/timeout/ordering assumptions · violations of repo guidance.

Not findings: style, naming, or "consider refactoring" unless it hides a real defect.

Severity: `critical` (data loss, security, broken deploy) · `high` (likely bug in normal use, broken contract) · `medium` (edge-case bug, likely follow-up breakage, an unmet acceptance criterion) · `low` (non-blocking; mention, never publish).

## 4. PR-specific stability rules

- Already settled, so do not re-raise: resolved threads; threads where the author explained a decline/deferral; concerns the author explicitly declined in comments, unless the new diff adds a materially different failure mode.
- Prior reviews by `viewer` are your baseline. Add new findings only for new diff content or a clearly missed material defect, and say which.
- Verify bot and human claims alike. Do not repeat a claim just because someone made it.
- **Cumulative coverage.** A PR too large for one pass may be reviewed across several passes. Every partial review you publish lists the changed areas (paths or path groups) it read and those it did not, in `Covered:` and `Not covered:` lines. A later pass may treat an area as covered when an earlier `viewer` review lists it as read, if that review was made on `pr.headSha`, or on an earlier head whose diff to `pr.headSha` a later `viewer` pass reviewed. That pass then reads only the areas no pass has covered. The review is **complete** when, together, the passes cover every changed file except the skipped ones (step 2.3) and no finding from those passes remains unresolved on the current head. Otherwise it stays **partial**. Never count an area as covered from a non-`viewer` review, a prose summary without the area named, or a review on a head whose later changes no pass has read.

## 5. Grade

`★★★★★` means no material findings. Any lower grade must be justified by at least one finding.

## 6. Publish (PR + explicit request only)

- **Partial coverage**: a review that is still partial never approves. Publish the grade as a `COMMENT` review whose body has the `Covered:` and `Not covered:` lines, even at 5 stars.
- **5 stars** on a complete review (one pass or cumulative): `gh pr review <n> --approve`, adding `--body "<Ticket: line>"` when the ticket could not be loaded (skip if `viewer` already approved `pr.headSha`). If approving fails (for example on your own PR), fall back to `gh pr review <n> --comment --body "★★★★★"` (plus the `Ticket:` line, if any).
- **Resolve your fixed threads** on a re-review: for each unresolved thread whose first comment is by `viewer` (a finding you posted earlier), when the current head fixes that finding, reply in the thread with one line naming the fixing commit and resolve it (`gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<threadId>`, the id from `pr-context.sh`). Leave a thread open when the finding still holds, and never resolve a thread a person started. Do this also when nothing else is published.
- **Nothing new**: when the grade is below 5 and every finding was already raised by `viewer` on the same effective diff, publish nothing.
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
Coverage: <full | cumulative (passes on <shas>) | partial>
Covered: <areas read by this pass>   (PR targets, when coverage is not full)
Not covered: <areas no pass has read yet, or none>
Ticket: <ref> not loaded (needs <MCP server, tool, or CLI for the tracker>)

1. [high] path:line - failure mode. Smallest fix: ...
...
Published: <review URL | approved | skipped (head already approved) | skipped (no new findings) | not requested>
```

Include the `Ticket:` line only when a referenced ticket could not be loaded. Keep the `Published:` line exactly in one of these forms: automation parses it.
