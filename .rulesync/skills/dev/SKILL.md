---
name: dev
description: >-
  Implement a feature or fix from a request or ticket end to end: orient, make
  the smallest complete change, validate, and either hand off for a PR or ship
  it (branch, commit, push, PR). Use when the user asks to implement, build, or
  fix something, or to work on, develop, or ship a ticket.
---

# Dev

## Inputs

- **Source**: a ticket reference/URL/file, or a direct request. Default: the request from the conversation.
- **Ship**: when the user says "ship", "open a PR", or "end to end", continue into shipping after validation. Otherwise stop at a validated, uncommitted change.
- **Guidance**: any remaining text sets scope, priorities, or tradeoffs.
- **Status**: only when the request or a calling agent asks to track status on the issue (for example the delivery flow's `status-labels` or `project`): move it to `in-progress` when you start and to `in-review` once its PR is open (here when shipping, or when the caller reports it), following `references/work-status.md`.

Stop with `Missing implementation request` if there is no source.

## 1. Orient

1. For a ticket, load the body, comments, and attachments following `references/tickets.md`, and open every image yourself (its `Images in every stage` section): implement the UI and rules the images show, not their description. Keep the ticket URL for the PR. If no access can load it, stop and say which tool, MCP server, or CLI is needed.
2. Write a 2-4 line brief: goal, constraints, acceptance criteria. If the source already contains a plan (for example from `ticket-plan`), use it.
3. Survey before editing: find the code paths, existing patterns, and tests that the change touches. Read the nearest `AGENTS.md`/`CLAUDE.md`.
4. If the request is ambiguous in a way that changes the implementation, ask once; in a non-interactive run (CI, or a caller that says so), follow [references/non-interactive.md](references/non-interactive.md) instead: a blocker comment on the ticket, then stop. Otherwise state your assumption and proceed.

## 2. Implement

- Make the smallest change that fully meets the acceptance criteria. Follow existing patterns.
- Add or update tests where the project has tests for that area.
- Note follow-ups that are out of scope instead of doing them.

## 3. Validate

Run the narrowest relevant project-native checks: changed-area tests, lint, typecheck, build. Use documented commands (`package.json`, `Makefile`, `AGENTS.md`). If a category has no command, say so instead of inventing one. **Stop** on failure: report it, and do not ship.

## 4. Ship (only if requested)

If the `ship` skill is available, follow it, passing the ticket URL. Otherwise: create a `<type>/<slug>` branch if you are on the base branch, commit with a conventional message, `git push -u origin <branch>`, and run `gh pr create` with a body that links the ticket.

## Output

```text
Implemented: <brief>
Changed: <files or areas>
Validation: <commands and results>
Follow-ups: <out-of-scope items, if any>
Next: <ready to ship on <branch> | PR <url>>
```
