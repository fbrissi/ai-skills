---
name: quality-cycle
description: >-
  Orchestrate a review, QA, and fix loop on a branch: code review of the full
  diff plus end-to-end QA of BDD scenarios, developer fixes, then re-review and
  re-test of what changed and its regressions, until reviewer and QA both
  approve or a round limit escalates to the user. Keeps a cycle log and pushes
  once. Use when the user asks for a quality cycle, review and QA loop, or to
  get a branch approved before pushing or opening a PR.
---

# Quality cycle

Three independent roles, one loop: **Reviewer** (code), **QA** (running app), **Developer** (fixes). The branch is done only when Reviewer and QA both approve in the same round.

## Inputs

- **Target**: the branch to bring to approval. Default: the current branch against its base (`git symbolic-ref --short refs/remotes/origin/HEAD`).
- **Max rounds**: from the request, else the profile, else 3.
- **Push**: whether to push (and open a PR) after approval. Default: ask once both approve.
- **Profile**: default `docs/ai/quality-cycle.md`; [references/profile-template.md](references/profile-template.md) lists its fields. Without one, use the defaults here and the `review-changes`, `qa-e2e`, and `bdd-scenarios` profiles.

Stop if the working tree has uncommitted changes that are not part of the target; ask the user to commit or stash them first. The cycle's own artifacts (the cycle log, QA reports and their screenshots) do not count as such changes, so a cycle can resume.

## Roles and independence

Run Reviewer and QA as fresh, independent contexts when the harness can delegate (subagents or separate sessions). When the harness has agents named `code-reviewer`, `qa-tester`, and `developer` (for example from the ai-skills plugin), delegate the roles to them; otherwise use generic subagents. Give each only the target, the base branch, the ticket or issue reference when there is one, the previous round's findings, and its skill. Each role opens the ticket's images itself, as [Images in every stage](references/tickets.md#images-in-every-stage) says; never pass another role's description of them instead. Never let the Developer's reasoning leak into their prompts. Without delegation, run the roles sequentially yourself, announce each switch (`Role: Reviewer, round 2`), and judge only from the repository and the running app, not from what you remember writing.

Decisions that belong to the user (scope changes, product rules, accepting a known risk, pushing, opening a PR) are asked, never assumed. Ask with the harness's question capability if it has one; otherwise ask in chat and wait. In a non-interactive run (CI, or a caller that says so) never wait, as [references/non-interactive.md](references/non-interactive.md) says: the caller's inputs decide pushing and the PR, and anything else that needs the user ends the cycle as `escalated` with the question in the output, ready for the caller's blocker comment.

## Skills and fallbacks

| Step | Preferred skill | Fallback when not installed |
| --- | --- | --- |
| Scenarios | `bdd-scenarios` | List the user-visible behaviors the diff changes as Given/When/Then bullets in the cycle log |
| Review | `review-changes` | Review `git diff <base>...HEAD` file by file for correctness, security, contracts, and partial updates; rank findings critical/high/medium/low |
| QA | `qa-e2e` | Drive the app in a browser through each scenario at desktop and mobile widths; record pass/fail, screenshots, and a verdict |
| Fixes | `dev` | Make the smallest fix, add a test where the area has tests, run the narrowest checks |
| Debugging | `systematic-debugging` | Reproduce, isolate, form one hypothesis, prove it, then fix |
| Tests first | `test-driven-development` | Write a failing test that reproduces the finding before fixing |
| Before claiming done | `verification-before-completion` | Re-run the commands and read their output before reporting success |

## 0. Set up

1. Record the base, the head sha, and the scope (`git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`).
2. Make sure scenarios exist for the changed capabilities (run `bdd-scenarios` on the diff if they are missing or stale).
3. Start the cycle log from [references/cycle-log-format.md](references/cycle-log-format.md) at the profile's path (default `docs/qa/cycles/<YYYY-MM-DD>-<branch-slug>.md`).
4. If step 2 created or updated scenario files, commit them locally in their own commit (`test: add bdd scenarios for <scope>`) before round 1. They ship with the branch, so the push and the PR include them.

## 1. Review and QA (each round)

- **Reviewer** always reviews the **full diff against the base** (`<base>...HEAD`), never only the last commit, and runs the project's tests, lint, and typecheck for the changed areas. Verdict: APPROVED when no critical, high, or medium finding remains open; otherwise CHANGES REQUIRED.
- **QA** runs round 1 on every scenario in scope. From round 2, it re-tests each previously failing scenario, the scenarios covering files changed by the fixes, and a regression pass over the touched areas (their `@smoke` scenarios at minimum). Verdict as defined by `qa-e2e`.
- **QA in CI**: QA uses a real browser when a test environment can be set up in CI (the CI setup command from the caller or the `qa-e2e` profile), on the scenarios for what the task changed. Otherwise it runs **targeted validation** (focused tests for the new behavior, the app or API started headless to exercise the changed endpoints or commands when feasible, framework smoke checks) and returns a normal verdict from that evidence; the cycle reports the QA mode and evidence (also in the PR body). Never escalate only because there is no E2E setup.

Run Reviewer and QA in parallel when both are delegated; otherwise Reviewer first.

- **Scheduled and background work**: scenarios for cron jobs, scheduled tasks, queue consumers, and the e-mails they send must be exercised by triggering them on purpose (the profile's trigger commands), because a local stack never fires them on its own. A job that nobody triggered is `blocked`, not `pass`.
- **Blocked scenarios**: a scenario QA marks `blocked` because it needs the user (a real credential, a certificate, a device, an external account) stays open in the cycle log with what is needed. Ask the user for it; the cycle is not approved while such scenarios remain in scope unless the user explicitly accepts leaving them out. Once the user provides it, do only the step that needs the user yourself (for example, open the page where they type the secret), then **delegate the blocked scenarios to a fresh QA run** with the new state and the open findings; do not run them yourself in the orchestrating context. Their result is part of the current round.

## 2. Triage

Merge both finding lists, drop duplicates, and classify each:

| Class | Action |
| --- | --- |
| blocker, critical, high, medium | Fix in this cycle |
| low, in touched code, cheap (minutes) | Fix in this cycle |
| low elsewhere, or pre-existing | Follow-up ticket (with the `ticket-create` skill if installed, otherwise a list in the cycle log for the user) |
| disputed | Record the evidence; the role that raised it decides next round, or the user decides |
| needs a product or scope decision | Ask the user |

## 3. Fix (Developer)

- Fix each finding at its root cause. Then search for the **same pattern in sibling code paths** (other handlers, routes, views, or call sites with the same shape) and fix those too, noting each in the log.
- Add or update a test that would have caught it where the area has tests.
- Run the narrowest relevant checks and read their output before claiming a fix.
- Commit locally with conventional messages, one commit per finding or tight group. **Do not push between rounds** unless the user asks.

## 4. Record and repeat

Append the round to the cycle log: findings with IDs, triage class, fix commit, verdicts of both roles. If the profile sets `Commit cycle logs and QA reports: yes`, commit the log and the round's QA report locally (`docs: record quality cycle round <n>`); screenshots follow the same setting unless the profile excludes them. With `no` (the default), leave them uncommitted and suggest adding their folders to `.gitignore`. Then start the next round at step 1.

Finish when both roles return APPROVED in the same round and no scenario in scope is still `blocked` (unless the user accepted it). If the round limit is reached first, stop and escalate: summarize what is still open, why it did not converge (disagreement, flaky environment, scope too large), and ask the user how to proceed. Also stop early when a round makes no progress (same findings, no new commits).

## 5. Ship (after both approve)

Run the final full checks once more on the head commit, then ask the user before pushing unless the request already said to push. Push once. If a PR is wanted and the `pr-create` or `ship` skill is installed, follow it; otherwise `git push -u origin <branch>` and `gh pr create` with a body that summarizes the change, the cycle (rounds, findings fixed, follow-ups), and the QA report path.

## Output

```text
Quality cycle: <branch> vs <base>
Rounds: <n>/<max>   Status: <approved | escalated: reason | stopped: reason>
Reviewer: <APPROVED | CHANGES REQUIRED>   QA: <APPROVED | CHANGES REQUIRED> (<browser | targeted validation>)
Fixed: <n> (<sibling fixes> in sibling paths)   Follow-ups: <n>   Open: <n>
Cycle log: <path>   QA report: <path>
Pushed: <yes, <sha> | no (awaiting approval) | not requested>   PR: <url | none>
```
