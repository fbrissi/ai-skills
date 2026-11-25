---
name: ticket-create
description: >-
  Create a ticket/issue that summarizes the current work: uncommitted changes or
  the commits ahead of a base branch. Use when the user asks to open, file, or
  create a ticket or issue describing the current changes.
---
# Ticket create

## Inputs

- **Base**: a branch name. If omitted: uncommitted changes when there are any, otherwise commits ahead of the remote default branch.
- **Guidance**: audience, focus areas, labels, or related issues.
- **Assignee**: a login given by the request or a calling agent. Default: yourself when the identity is a person; none with a GitHub App or bot token (see `references/tickets.md`).
- **Triage**: only when the request or a calling agent asks for it (estimate, category, priority, due date, owner).

## Steps

1. Load scope:
   - uncommitted: `git status --short`, `git diff HEAD --stat`
   - branch: `git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`
2. Stop with `Nothing to turn into a ticket` if the scope is empty.
3. Read commit messages first, then only the diffs needed to understand the intent. Group the work into 2-4 outcome themes. For branch scope, every theme must be backed by a commit ahead of base.
4. Write the ticket with `references/body-format.md` (no `## Ticket` section). If the work is uncommitted, say so in the description.
5. Create it with the provider's create command from `references/tickets.md`, with the assignee resolved as above (drop `--assignee` when it is none), adding any labels the user requested. If no access can create it, stop and say which tool, MCP server, or CLI is needed.
6. When triage was requested, set the fields with `references/triage.md`.

## Output

```text
Ticket: <title>
URL: <url>
Triage: <fields set, or not requested>
```
