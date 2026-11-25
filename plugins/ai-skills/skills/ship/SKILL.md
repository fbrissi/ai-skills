---
name: ship
description: >-
  Ship the current work in one pass: create a work branch if needed, commit,
  push, and open a pull request with a linked ticket. Use when the user asks to
  ship, deliver, or "branch, commit and open a PR" for the current changes.
---
# Ship

Branch → commit → push → PR. Each step is skipped when it is already done, so re-running is safe.

## Inputs

- **Base**: a branch name. Default: the remote's default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, minus `origin/`).
- **Ticket**: a reference, `auto`, or `skip`. Passed to the PR step.
- **Guidance**: branch naming hints or PR context.

## 1. Load once

```bash
git branch --show-current
git status --porcelain
git diff HEAD --stat
git fetch origin <base>
git log --oneline origin/<base>..HEAD
```

If there are no uncommitted changes and no commits ahead of base, stop with `Nothing to ship`.

## 2. Branch

Keep the current branch if it is not the base and not a protected branch. Otherwise create one:

- Name: the repo's branch convention if it has one (for example the branch templates of a delivery profile, `docs/ai/delivery.md`). Otherwise `<type>/<kebab-slug>`, where type is `feature`, `bugfix`, `hotfix`, `refactor`, `docs`, `test`, `chore`, `perf`, or `ci`, and the slug is 2-5 words taken from the change themes or ticket.
- `git switch -c <name>`. If the name exists, add a short numeric suffix once.

## 3. Commit

If there are uncommitted changes, stage and commit them following `references/commits.md`. Use the diff you already loaded; do not re-run discovery commands. If the worktree contains unrelated changes, ask which ones to include; in a non-interactive run (CI, or a caller that says so), commit only what the caller named, or stop as [references/non-interactive.md](references/non-interactive.md) says.

## 4. Push and PR

If the `pr-create` skill is available, follow it, passing the base and ticket. Otherwise: `git push -u origin <branch>`, then `gh pr create --base <base> --title <title> --body-file <f> --assignee @me`, with the body built from `references/body-format.md`.

## Output

```text
Shipped: <title>
Branch: <branch> (<created | kept>)
Commit: <sha | none>
PR: <url>
Ticket: <url | SKIPPED>
```
