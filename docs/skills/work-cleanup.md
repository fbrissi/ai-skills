# work-cleanup

Cleans up the local branches, worktrees, and optionally remote branches left over from finished work. Classifies each item as safe to remove or keep, with a reason, shows the exact list, and deletes only what you confirm. Never deletes by force.

**Requires:** `git`. `gh`/`glab` for PR state; without them, PR state is `unknown` and unmerged branches are kept.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Target | branch name | the branch of the work just finished |
| Scope | `work`, `all` | `work` (target, its worktrees, its remote branch) |
| Remote | `yes`, `no` | `yes`, always confirmed separately |
| Protected | branch names or patterns | default branch, `main`, `master`, `develop`, `development`, `release/*`, `release-*`, `hotfix/*` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/work-cleanup`, `/work-cleanup feat/login-timeout`, `/work-cleanup all, no remote` |
| Codex CLI | `$work-cleanup all` |
| OpenCode | "the PR is merged, use the work-cleanup skill" |

## What it does

1. Fetches with prune and loads worktrees, local branches, upstream tracking, and each candidate's PR state.
2. Keeps protected branches, the current branch or worktree, open PRs, uncommitted changes, and unpushed or unmerged commits, each with its reason. If the finished branch is checked out in the main worktree and otherwise safe, it offers to switch to the default branch first.
3. Shows a numbered plan: what will be removed (path, branch, last commit, PR state) and what is kept and why.
4. Asks for confirmation: local items, each `git branch -D` item by name (squash-merged branches), and remote branches separately.
5. Runs `git worktree remove` and `git worktree prune`, `git branch -d`, and `git push origin --delete` for confirmed items only, then reports removed, kept, and skipped items.

## Side effects

Removes confirmed worktrees, local branches, and remote branches.
