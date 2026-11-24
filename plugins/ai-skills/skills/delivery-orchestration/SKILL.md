---
name: delivery-orchestration
description: >-
  Drive a GitHub milestone's ready issues to implementation without coding:
  builds the dependency graph, creates the milestone branch and one task branch
  per issue, starts implementation for the issues whose dependencies are done
  (dispatching a workflow in CI or handing off locally) up to a parallel limit,
  and opens the milestone PR when every issue is done. Use when the user or a
  workflow asks to orchestrate, start, or advance a milestone's delivery.
---
# Delivery orchestration

As orchestrator you never write code, review it, or merge; only in `local` mode without delegation do you play the implementer role, one task at a time, as step 4 says. Each run advances the milestone as far as it can and exits; it is re-run when a task PR merges into the milestone branch, so never wait for work to finish.

## Inputs

Resolve every value with [references/delivery-profile.md](references/delivery-profile.md), which also defines the branch names. This skill reads `milestone` (required), `base-branch`, `implement-workflow`, `max-parallel`, `status-labels`, `project`, `project-status-field`, `project-status-options`, `context`, and `profile`.

Stop with `Unable to orchestrate: missing milestone` if there is none.

**Mode**: `dispatch` when running in CI (`GITHUB_ACTIONS=true`) and `gh workflow view <implement-workflow>` finds the workflow; otherwise `local`.

## 1. Load

1. Load every issue in the milestone with labels, body, and state (`gh issue list --milestone "<title>" --state all --json number,title,labels,body,state`).
2. Resolve the milestone branch `feat/<milestone-slug>`. If it does not exist on the remote, create it from the head of `base-branch` (`git fetch origin <base-branch>`, then `git push origin origin/<base-branch>:refs/heads/<milestone-branch>`).
3. Load the task PRs into the milestone branch (`gh pr list --base <milestone-branch> --state all --json number,state,headRefName,body,mergedAt`). Match a PR to its issue by the task branch name (`feat/<milestone-slug>-<n>-`) or an issue link in its body.

## 2. Update done

With [references/work-status.md](references/work-status.md), move an issue to `done` when its task PR is merged into the milestone branch. This is the only move out of `in-review` this skill makes. Task PRs do not close their issues (they do not target the default branch); the milestone PR does.

## 3. Build the graph

- Edges come from `Depends on #<n>` lines in the issue body (also "blocked by #<n>"). A dependency outside the milestone counts as done only when that issue is closed.
- On a cycle, or a dependency on a missing issue, do not start any issue in it: comment on each affected issue, move it to `needs-technical-refinement`, and report it.
- **Startable**: `ready`, every dependency `done`, and no open task PR.
- **Running**: `in-progress`. Free slots = `max-parallel` minus running.

## 4. Start tasks

For each startable issue, while slots are free, in order of highest Priority, then earliest Target date, then lowest number (triage fields as [references/triage.md](references/triage.md) reads them; this skill never changes them):

1. Re-read its labels; skip it if it is no longer `ready`.
2. Create the task branch `feat/<milestone-slug>-<n>-<issue-slug>` from the current head of the milestone branch if it does not exist (`git push origin origin/<milestone-branch>:refs/heads/<task-branch>` after a fresh fetch). Reuse it if it exists.
3. Move the issue to `in-progress`.
4. Start the work:
   - `dispatch`: `gh workflow run <implement-workflow> --ref <default-branch> -f issue=<n> -f branch=<task-branch> -f base_branch=<milestone-branch>`. The workflow's dispatch inputs are exactly `issue`, `branch`, and `base_branch` (underscore); `<default-branch>` is the repository's default branch, where the workflow file lives. If the dispatch fails, move the issue back to `ready` and report the error.
   - `local`: hand the task (issue, task branch, milestone branch as base) to an implementer: the `task-implementer` agent when the harness has it, in parallel up to the free slots; otherwise do it yourself one task at a time with the `dev` skill, then the `quality-cycle` skill, then the `pr-create` skill with the milestone branch as base, and move the issue to `in-review` once its PR is open. Report each result; do not wait for merges.

## 5. Close the milestone

When every open issue in the milestone is `done`, open the PR from the milestone branch into `base-branch` with the `pr-create` skill (if it is not installed: `gh pr create --base <base-branch> --head <milestone-branch>` with a body file). Its body lists every issue with `Closes #<n>`, links the milestone and its source, and summarizes the task PRs. If an open PR already exists for the milestone branch, report it instead. Never merge it: the repository's review and merge process decides.

Issues that are blocked, still in refinement, or waiting for review keep the milestone open; list them in the report.

## Output

```text
Delivery: <milestone>   Mode: <dispatch | local>
Milestone branch: <branch> (<created | existing>)   Base: <base-branch>
| Issue | Status | Depends on | Branch | PR | Action |
|---|---|---|---|---|---|
Started: <n> (<free slots> free of <max-parallel>)   Done: <n>/<total>
Waiting: <issue: reason>
Milestone PR: <url | not yet: reason>
```
