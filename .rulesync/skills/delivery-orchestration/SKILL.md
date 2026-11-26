---
name: delivery-orchestration
description: >-
  Drive a GitHub milestone's ready issues to implementation without coding:
  builds the dependency graph, creates the milestone branch and one task branch
  per issue, starts implementation for the issues whose dependencies are done
  (dispatching a workflow in CI or handing off locally) up to a parallel limit,
  keeps a draft milestone PR that aggregates the task PRs, adds the release
  notes in their own PR when every issue is done, then marks the milestone PR
  ready, and closes the milestone after it merges. Use when the
  user or a workflow asks to orchestrate, start, or advance a milestone's
  delivery.
---

# Delivery orchestration

As orchestrator you never write code, review it, or merge (the release notes of step 5 are the only change you write); only in `local` mode without delegation do you play the implementer role, one task at a time, as step 4 says. Each run advances the milestone as far as it can and exits; it is re-run when a task PR merges into the milestone branch and when the milestone PR merges, so never wait for work to finish.

## PR structure

One milestone produces many PRs, so they are stacked for review:

- The milestone branch is the release branch of the [branch model](references/delivery-profile.md) and is created first, from `base-branch`. Every task branch is created from the milestone branch, and every task PR targets the milestone branch. Task PRs follow the repository's PR follow-up and may merge on their own where the repository allows it.
- One milestone PR, from the milestone branch into `base-branch`, aggregates the task PRs so reviewers see the whole delivery as one combined diff. It is opened as a draft as soon as the milestone branch has a commit ahead of `base-branch`, its body is kept current on every run, and it is marked ready for review when every issue is done. It always needs a human approval; this skill never merges it.

## Inputs

Resolve every value with [references/delivery-profile.md](references/delivery-profile.md), which also defines the branch names. This skill reads `milestone` (required), `base-branch`, `release-branch-template`, `feature-branch-template`, `implement-workflow`, `max-parallel`, `release-notes-file`, `release-heading`, `release-version`, `version-files`, `release-notes-branch-template`, `status-labels`, `project`, `project-status-field`, `project-status-options`, `context`, `requested-by`, and `profile`.

Stop with `Unable to orchestrate: missing milestone` if there is none.

**Git and API errors stop the run.** When a branch push, PR command, or dispatch fails, do not run the steps that depend on it: no status move, no dispatch, and no PR for that issue or the milestone. Report the command and its error, leave every issue in the state it had before the failed step, and stop with a blocker (stop-point format, stage `orchestrate`) when the error needs a person, for example a rule that rejects the push.

**Mode**: `dispatch` when running in CI (`GITHUB_ACTIONS=true`) and `gh workflow view <implement-workflow>` finds the workflow; otherwise `local`.

## 1. Load

1. Load every issue in the milestone with labels, body, and state (`gh issue list --milestone "<title>" --state all --json number,title,labels,body,state`), and the milestone itself (`gh api repos/{owner}/{repo}/milestones?state=all`) for its number, state, and the `requested-by` marker in its description when the run has none.
2. Resolve the milestone branch from `release-branch-template` (default `release/<milestone-slug>`). When it does not exist but the milestone already has an open milestone PR from another branch (an older name), keep using that branch. If it does not exist on the remote, create it from the head of `base-branch` (`git fetch origin <base-branch>`, then `git push origin origin/<base-branch>:refs/heads/<milestone-branch>`).
3. Load the task PRs into the milestone branch (`gh pr list --base <milestone-branch> --state all --json number,title,state,headRefName,body,mergedAt,url`). Match a PR to its issue by the task branch name (`feature-branch-template` up to `{n}`, for example `feature/<milestone-slug>-<n>-`, or an older prefix such as `feat/<milestone-slug>-<n>-`) or an issue link in its body (`Closes #<n>`, as in a bugfix PR into a release opened for a bugfix, see the profile's Opening a release for a bugfix).
4. Load the milestone PR (`gh pr list --head <milestone-branch> --base <base-branch> --state all --json number,state,isDraft,mergedAt,url`). If it is merged, go to step 6 and stop there.

## 2. Update done

With [references/work-status.md](references/work-status.md), move an issue to `done` when its task PR is merged into the milestone branch. This is the only move out of `in-review` this skill makes; it also moves the issue a tracking issue's `Fix for #<n>` line names (a release opened for a bugfix, see the profile) to `done`. Task PRs do not close their issues (they do not target the default branch); the milestone PR does.

## 3. Build the graph

- Edges come from `Depends on #<n>` lines in the issue body (also "blocked by #<n>"). A dependency outside the milestone counts as done only when that issue is closed.
- On a cycle, or a dependency on a missing issue, do not start any issue in it: comment on each affected issue in the stop-point format of [references/delivery-profile.md](references/delivery-profile.md) with stage `orchestrate`, move it to `needs-technical-refinement`, and report it.
- **Startable**: `ready`, every dependency `done`, and no open task PR.
- **Running**: `in-progress`. Free slots = `max-parallel` minus running.

## 4. Start tasks

For each startable issue, while slots are free, in order of highest Priority, then earliest Target date, then lowest number (triage fields as [references/triage.md](references/triage.md) reads them; this skill never changes them):

1. Re-read its labels; skip it if it is no longer `ready`.
2. Create the task branch from `feature-branch-template` (default `feature/<milestone-slug>-<n>-<issue-slug>`) from the current head of the milestone branch if it does not exist (`git push origin origin/<milestone-branch>:refs/heads/<task-branch>` after a fresh fetch). Reuse it, or the branch of an existing task PR for the issue, if it exists.
3. Move the issue to `in-progress`.
4. Start the work:
   - `dispatch`: `gh workflow run <implement-workflow> --ref <default-branch> -f issue=<n> -f branch=<task-branch> -f base_branch=<milestone-branch>`, plus `-f requested_by=<login>` when `requested-by` is known and the workflow declares that input. `<default-branch>` is the repository's default branch, where the workflow file lives. If the dispatch fails, move the issue back to `ready` and report the error.
   - `local`: hand the task (issue, task branch, milestone branch as base, `requested-by`) to an implementer: the `task-implementer` agent when the harness has it, in parallel up to the free slots; otherwise do it yourself one task at a time with the `dev` skill, then the `quality-cycle` skill, then the `pr-create` skill with the milestone branch as base, and move the issue to `in-review` once its PR is open. Report each result; do not wait for merges.

## 5. Milestone PR

Use the `pr-create` skill (if it is not installed: `gh pr create --base <base-branch> --head <milestone-branch> --draft` with a body file; never more than one open PR for the milestone branch).

1. **Open it as a draft** when none is open and the milestone branch has at least one commit ahead of `base-branch` (`git rev-list --count origin/<base-branch>..origin/<milestone-branch>`), assigned to `requested-by` when known.
2. **Keep its body current** on every run (`gh pr edit <n> --body-file <f>`): the milestone and its source, then one line per issue with its status and task PR (`- [x] Closes #<n> <title> (#<task PR>, merged)`, `- [ ] Closes #<n> <title> (<status>)`), and a short summary of the merged task PRs.
3. **Release notes** when every open issue in the milestone is `done` and `release-notes-file` is set, following the profile's release notes rules ([references/delivery-profile.md](references/delivery-profile.md)):
   - Already done (the milestone branch has the section for the version): go to the next sub-step.
   - An open release notes PR exists (head from `release-notes-branch-template`, base the milestone branch): leave the milestone PR in draft and report it as waiting for that PR.
   - Otherwise create the release notes branch from the head of the milestone branch, start `release-notes-file` (and changed version files) from `base-branch` without merging it (the profile's Sync rule), compute the version above every version in the notes, release tags, and other open release branches (a release opened for a bugfix uses its milestone title, the profile's Version rule), write the section at the top and the version files, commit (`docs: add release notes for <version>`), push, and open a PR into the milestone branch with the `pr-create` skill (title `docs: release notes for <version>`, body listing the task PRs it summarizes, assignee `requested-by` when known). It follows the same PR follow-up as the task PRs; its merge runs this skill again. Leave the milestone PR in draft.
4. **Mark it ready** when every open issue in the milestone is `done` and the release notes are done or `release-notes-file` is unset (`gh pr ready <n>`), request review from `requested-by` when known (`gh pr edit <n> --add-reviewer <login>`), and comment once mentioning them that the milestone is ready for review. Never merge it, and never change its review requirements: it always needs a human approval.

Issues that are blocked, still in refinement, or waiting for review, and release notes not merged yet, keep the PR in draft; list them in the report.

## 6. Complete the milestone

When the milestone PR is merged: move to `done` every issue of the milestone that is already `done` or whose task PR merged into the milestone branch (not closed as not planned), close any of them still open (`gh issue close <n> --comment "Delivered in #<milestone PR>"`) along with the issues their `Fix for #<n>` lines name; an issue whose PR did not merge into the milestone branch (for example a late bugfix PR still open) stays open in its state and goes in the report, and close the milestone (`gh api -X PATCH repos/{owner}/{repo}/milestones/<number> -f state=closed`). Start nothing new.

## Output

```text
Delivery: <milestone>   Mode: <dispatch | local>
Milestone branch: <branch> (<created | existing>)   Base: <base-branch>
| Issue | Status | Depends on | Branch | PR | Action |
|---|---|---|---|---|---|
Started: <n> (<free slots> free of <max-parallel>)   Done: <n>/<total>
Waiting: <issue: reason>
Release notes: <version>: <merged | PR <url> | not needed>
Milestone PR: <url> (<draft | ready for review | merged, milestone closed> | not yet: reason)
Blocked:
- #<issue> <state>: <summary> | questions: <comment URL>
```
