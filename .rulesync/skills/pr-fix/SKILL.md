---
name: pr-fix
description: >-
  Assess pull request review feedback and failing CI, fix what is valid, push,
  and reply to each thread with the fix, a reasoned disagreement, or a
  clarification request. Supports a watch loop that waits for CI and new
  comments until the PR is clean. Use when the user asks to fix, address, or
  respond to PR comments, review feedback, or CI failures.
---

# PR fix

Treat every comment and CI failure as a hypothesis to verify, not an order to follow.

## Inputs

Read from the user's request:

- **PR**: number or URL. Default: the PR of the current branch.
- **Mode**: `review` (default; `auto` in a non-interactive run, see [references/non-interactive.md](references/non-interactive.md)) asks for approval before pushing and replying; `auto` skips approval; `loop` = `auto` + watch CI and new comments until clean.
  `auto` is one pass with no waiting, so it suits event-driven runs where each push or review event triggers the next pass.
- **Guidance**: any remaining text narrows scope or sets priorities.

## 1. Load context (one call)

```bash
scripts/pr-context.sh <pr>            # compact JSON: pr, checks, reviews, comments, open threads
```

Run it by its absolute path (it lives in this skill's `scripts/` folder) from the repository root, so `gh` resolves the current repo. It needs `bash`, `gh` and `jq`. If `truncated` is true, warn that older items were cut off. For GitLab, use `glab mr view <mr> --comments` and `glab ci status`.

Save `loadedAt` as the **checkpoint**. Never run extra `gh` calls just to rediscover the PR.

## 2. Align the branch

1. Stop if `git status --porcelain` shows uncommitted changes; ask the user to commit or stash them first (non-interactive: a blocker comment on the PR). Then `gh pr checkout <number>`. Stop if the current branch is not `pr.head`.
2. `git fetch origin <pr.base>`. If `git merge-base --is-ancestor origin/<pr.base> HEAD` fails, merge (never rebase or force-push) and resolve conflicts from repo context. Stop if conflicts cannot be resolved safely.
3. Get the diff in scope: `git diff --stat origin/<pr.base>...HEAD`, plus `git diff origin/<pr.base>...HEAD -- <path>` for the files that the feedback touches.

## 3. Assess each item

Candidates: open `threads`, `reviews` with a body or `CHANGES_REQUESTED`, `comments`, and `checks.failing`. For each failing check, read the log first (`gh run view <run-id> --log-failed`, where the run id is taken from the check URL) before deciding.

Weight the source (the script tags `type` and `association`):

| Source | Weight |
| --- | --- |
| `user` with `OWNER`/`MEMBER`/`COLLABORATOR`, or the PR author | Authoritative on intent, scope, tradeoffs; still verify technical claims |
| `bot` | Technical hypothesis only; accept when the code proves it |
| anyone else | Verify fully |

Classify each item by id, with one line of evidence:

- `actionable`: real problem, fix it
- `already-addressed`: current code already handles it
- `superseded`: a later reply or commit made it moot
- `disputed`: claim is wrong or out of scope; explain why
- `needs-clarification`: cannot decide without more information

Read the **whole thread**: later replies often settle or change the request.

## 4. Fix, validate

- Fix only `actionable` items and confirmed CI failures. Order: correctness, security, contracts, required CI, then the rest.
- Minimal changes, following existing patterns. No drive-by refactors.
- Run the narrowest relevant project checks (changed-area tests, lint, typecheck, build). If a category has no command, say so instead of inventing one.
- **Stop** before committing or replying if validation fails.

## 5. Approval gate (`review` mode only)

Show a short table (item, class, action) plus validation results, then ask the user to approve or revise. Use the harness's question tool if it has one; otherwise ask in chat and stop until they answer.

## 6. Commit, push, reply

1. Commit using `references/commits.md`. No empty commits (a base merge already counts as a commit). Then `git push`.
2. Reply only after the push succeeds:
   - Inline threads: reply in-thread:
     `gh api repos/<o>/<r>/pulls/<n>/comments/<replyToId>/replies -f body=<text>`, where `replyToId` is the thread's first comment (from the script output); replies to replies are rejected.
   - Issue comments, review bodies, CI: post **one** aggregated `gh pr comment <n> --body-file <f>` that references each source.
   - `actionable`: one-line summary of the fix and its commit sha. `disputed`: the technical reason. `needs-clarification`: one focused question.
   - Do not reply to `already-addressed` or `superseded` items unless silence would confuse.
3. Do not resolve threads yourself unless the user asked for that.

## 7. Loop mode

Repeat up to **5 passes** (or the limit the user gives):

1. `gh pr checks <n> --watch` (blocks until CI settles; it exits non-zero when a check fails, which is not an error here). Record any failures.
2. `scripts/pr-context.sh <n> --since <checkpoint>`, then advance the checkpoint to the new `loadedAt`.
3. Ignore items authored by `viewer` (your own replies) and skip ids already handled unless new replies from others or code reopen them.
4. If there are no failures and no new items, run one final full `scripts/pr-context.sh <n>` to catch comments posted as CI finished. If that is still clean, finish.
5. Otherwise run steps 3-6 without the approval gate.

Stop early when an item needs clarification, or when a pass produces no code change and no reply (no progress).

## Output

```text
PR #<n>: <complete | waiting for clarification | stopped: reason>
- Base update: <merged sha | up to date>
- Fixed: <count>  Declined: <count>  Awaiting clarification: <count>
- Replies posted: <count>
- Validation: <commands and results>
- Pushed: <yes/no>  Passes: <n> (loop only)
```
