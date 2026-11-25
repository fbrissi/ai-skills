---
name: work-cleanup
description: >-
  Clean up the local git branches, worktrees, and optionally remote branches
  left over from finished work: classifies each as safe to remove or keep with
  a reason, shows the exact list, and deletes only what the user confirms,
  never by force. Use when work is finished, after a PR is merged or closed, or
  when the user asks to clean up branches or worktrees.
---

# Work cleanup

Inventory → classify → confirm → delete → report. Nothing is deleted before the user confirms the exact list. Deletions never use force: no `git worktree remove --force`, no `git branch -D` unless the user confirmed that item by name.

## Inputs

- **Target**: the work branch to clean up. Default: the branch of the work just finished (the current branch, or the one named in the conversation).
- **Scope**: `work` (the target, its worktrees, and its remote branch) or `all` (also every other local branch whose PR is merged or closed, or whose upstream is gone). Default: `work`.
- **Remote**: `yes` to also offer the matching remote branches, `no` to skip them. Default: `yes`; they are always confirmed separately.
- **Protected**: branch names or patterns never removed. Default: the remote's default branch, `main`, `master`, `develop`, `development`, `release/*`, `release-*`, `hotfix/*`, plus the repo's protected branches if it documents them.

## 1. Load once

Run from the repository (any of its worktrees):

```bash
git fetch --prune origin
git symbolic-ref --short refs/remotes/origin/HEAD
git rev-parse --show-toplevel
git branch --show-current
git worktree list --porcelain
git for-each-ref refs/heads --format='%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(committerdate:short)|%(subject)'
```

For each candidate branch, load its PR state: `gh pr list --head <branch> --state all --json number,state,url,headRefOid --limit 5` (GitLab: `glab mr list --source-branch <branch> --all`). If neither CLI works, the PR state is `unknown`.

Candidates:

- `work`: the target branch, every worktree that has it checked out, and `origin/<target>`.
- `all`: also every local branch whose PR is `MERGED` or `CLOSED`, or whose upstream shows `[gone]`, and their worktrees and remote branches.

If there are no candidates, stop with `Nothing to clean up`.

## 2. Classify

Check each candidate against these keep rules, in order. The first match keeps it, with that reason. A worktree is kept when its branch is kept, and vice versa.

| Keep rule | Check |
| --- | --- |
| Protected branch | name matches **Protected** |
| Current branch or worktree | it is the branch checked out here, or the worktree you are running in, or the main worktree |
| Open PR | PR state `OPEN` or `unknown` with commits not in `origin/<default>` |
| Uncommitted changes | `git -C <worktree> status --porcelain` is not empty, or the worktree is locked |
| Unpushed commits | `git rev-list --count <upstream>..<branch>` > 0. With no upstream, or one shown as `[gone]` (do not run `rev-list` against it), keep unless the PR is `MERGED` and `<branch>` equals the PR head (or is its ancestor) |
| Unmerged commits | `git rev-list --count origin/<default>..<branch>` > 0, unless the PR is `MERGED` and `<branch>` equals the PR head (or is its ancestor) |

If the target matches `Current branch or worktree` and none of the later rules, offer a way out in the plan instead of dropping it:

- In the main worktree: offer `git switch <default>` (only with no uncommitted changes) as its own plan item, and list the branch as a removal item that depends on it (`-d` or `-D` as classified below), so one confirmation covers both.
- In a linked worktree: it cannot remove itself. Keep it and tell the user to re-run from the main worktree or another one.

Everything else is safe. Mark how each safe branch is deleted:

- `-d`: `git merge-base --is-ancestor <branch> origin/<default>` succeeds, or its upstream still exists and contains it.
- `-D (confirm by name)`: the PR was squash- or rebase-merged, so git cannot see the branch as merged. Deleted only if the user confirms that branch by name.

A remote branch `origin/<branch>` is safe only when its local branch is safe (or absent), its PR is `MERGED` or `CLOSED`, and `git rev-list --count origin/<default>..origin/<branch>` is 0 or the PR is merged with that head. A closed, unmerged PR keeps the branch under `Unmerged commits`; the user can still ask for it by name, which makes it a `-D (confirm by name)` item.

## 3. Show the plan

Show the list before any deletion. Number every item.

```text
Cleanup plan (default branch: <default>)

Remove (local):
  1. worktree <path>  branch <branch>  last <sha> <date> <subject>  PR <#n STATE | none | unknown>
  2. branch <branch>  -d  last <sha> <date> <subject>  PR <#n STATE>
  3. branch <branch>  -D (confirm by name)  reason: squash-merged in #n

Remove (remote, confirm separately):
  4. origin/<branch>  last <sha>  PR <#n STATE>

Switch first (confirm):
  5. git switch <default>  releases current branch <branch>
  6. branch <branch>  -d  after 5  last <sha> <date> <subject>  PR <#n STATE>

Keep:
  - branch <branch>  worktree <path>: <keep rule> (<detail, e.g. 2 unpushed commits>)
```

## 4. Confirm

Ask the user, and wait for an explicit answer:

- which local items to remove (`all local`, item numbers, or none);
- each `-D` item, by name;
- the switch to `<default>` and the branch removal that depends on it, if offered;
- the remote items, as a separate question.

In a non-interactive run (CI, or a caller that says so; see [references/non-interactive.md](references/non-interactive.md)) nothing is confirmed: report the plan and remove nothing.

Remove only what was confirmed. Silence, an unclear answer, or a general "go ahead" that does not cover remote or `-D` items confirms none of them.

## 5. Clean up

Run in this order, from a worktree that is not being removed. Re-check each item right before deleting it; if its state changed (new commits, changes, an open PR), skip it and report why.

1. If confirmed, `git switch <default>`, then `git merge --ff-only origin/<default>` so `git branch -d` checks against the updated default. If the fast-forward fails, skip the dependent `-d` item and report it.
2. Worktrees: `git worktree remove <path>`, then `git worktree prune`.
3. Branches: `git branch -d <branch>`; `git branch -D <branch>` only for items confirmed by name.
4. Remote branches: `git push origin --delete <branch>`.

If a command fails, do not retry with force: record the error, skip the item, and continue.

## Output

```text
Work cleanup: <target>
Removed: <worktree <path> | branch <name> | origin/<name>>, ...
Kept: <item>: <reason>, ...
Skipped: <item>: <error or changed state>, ...
```
