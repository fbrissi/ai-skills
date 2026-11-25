---
name: pr-create
description: >-
  Open a pull request for the current branch from its committed work: push the
  branch, resolve or create the linked ticket, and write an outcome-focused PR
  body. Use when the user asks to open, create, or raise a PR/MR for the current
  branch.
---
# PR create

## Inputs

- **Base**: a branch name. Default: the remote's default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, minus `origin/`).
- **Ticket**: a ticket reference, `auto` (create one), or `skip`.
- **Draft**: when the user asks for a draft.
- **Assignee**: a login (for example a delivery flow's `requested-by`). Default: yourself when the identity is a person; none with a GitHub App or bot token (see `references/tickets.md`).
- **Guidance**: any remaining text shapes the PR description.

## 1. Load and check

```bash
git branch --show-current
git status --porcelain
git fetch origin <base>
git log --oneline origin/<base>..HEAD
git diff --stat origin/<base>...HEAD
```

Stop and report if any of these hold:

- There are uncommitted changes the user did not mention. Ask whether to commit them first (the `ship` skill does that), or continue with only the commits. In a non-interactive run ([references/non-interactive.md](references/non-interactive.md)), continue with only the commits and say so.
- The current branch equals the base.
- There are no commits ahead of base.
- An **open** PR/MR already exists for the branch: `gh pr view --json url,state` returns `state: OPEN` (a closed or merged PR does not block), or `glab mr list --source-branch <branch>` lists one. Report its URL instead of creating a duplicate.

Scope is **the commits ahead of base**. Read commit messages first, then diffs of the key files only as needed. Group the work into themes (what and why, not how).

## 2. Resolve ticket

In order of precedence: a reference given → use it. `skip` → `SKIPPED`. `auto` → create one. Otherwise, check the commits and branch name for a clear reference (`#123`, `Closes ABC-123`, `feature/abc-123-x`), as described in `references/tickets.md`. If none is found, ask the user once: provide a ticket, create one automatically, or skip. In a non-interactive run ([references/non-interactive.md](references/non-interactive.md)), default to `SKIPPED`.

To create one: use the change themes with `references/body-format.md` (no `## Ticket` section) and the create command from `references/tickets.md`, with the assignee resolved as above. If no access can create it, stop and say which tool, MCP server, or CLI is needed.

## 3. Push and create

1. `git push`. If there is no upstream, run `git push -u origin <branch>`. Stop on failure. Never force-push.
2. Write the body to a temp file following `references/body-format.md`, or the repo's PR template if one exists.
3. Create the PR:
   - GitHub: `gh pr create --base <base> --head <branch> --title <title> --body-file <f> [--assignee <login | @me>] [--draft]`. Drop `--assignee` when the assignee resolved to none; `@me` fails with an App or bot token.
   - GitLab: `glab mr create --target-branch <base> --source-branch <branch> --title <title> --description "$(cat <f>)" --assignee <your-username> [--draft] --yes` (username from `glab api user --jq .username`; `--yes` skips the confirmation prompt)
4. Delete the temp file.

## Output

```text
PR: <title>
URL: <url>
Branch: <branch> -> <base>
Ticket: <url | SKIPPED>
```
