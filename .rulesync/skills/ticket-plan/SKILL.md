---
name: ticket-plan
description: >-
  Turn a ticket or request into a scoped, repo-grounded implementation plan
  with requirements and validation steps. Optionally syncs the plan back to the
  ticket or creates a new one. Use when the user asks to plan a ticket, issue,
  feature, or fix, or to write or refine a ticket's implementation plan.
---

# Ticket plan

Plan only. Do not edit source files.

## Inputs

- **Source**: a ticket reference/URL, a file path, or a free-text request. Default: the request from the conversation.
- **Sync**: only when the user asks to save, sync, or update the ticket, or to create a ticket from the plan. Otherwise just present the plan.
- **Triage**: only when the request or a calling agent asks for it: estimate, category, priority, and due date, decided with `references/triage.md` and written on sync.
- **Focus**: any remaining text adds constraints or emphasis.

Stop with `Unable to plan: missing request or ticket context` if there is no source.

## 1. Load

For a ticket, load the body **and comments** following `references/tickets.md`. If no access can load it, stop and say which tool, MCP server, or CLI is needed. Extract:

- **Objective**: what the latest request asks for.
- **Constraints still in force**: earlier comments that set business rules, decisions, renames, ordering, migrations, or scope cuts.
- **Proposed technical direction**: implementation details already suggested.
- **Open questions**: only the ones that are genuinely unresolved.

## 2. Ground in the repo (technical requests)

Do light, targeted reconnaissance: the relevant code, schema, config, UI patterns, and existing tests. Confirm current behavior instead of trusting the ticket text. Keep proposed details that are correct, improve the ones that are incomplete, and flag the ones that conflict with reality. If you cannot verify something, say so rather than sounding certain.

Ask the user only if a missing detail blocks a reliable plan; in a non-interactive run (CI, or a caller that says so), follow [references/non-interactive.md](references/non-interactive.md) instead. Otherwise record it as an assumption.

## 3. Shape

Scale the plan to the work: small requests get a few lines, large tickets get sections by area.

```text
Title: <short outcome title>

Description:
<intended outcome, scope, key constraints, material technical direction>

## Implementation
- [ ] <requirement, keeping technical qualifiers that matter (file, API, migration)>

## Validation
- [ ] Verify that <observable result>

Triage: <estimate, category, priority, due date: only when requested>

Assumptions / Risks / Open questions: <only if they matter>
```

Do not use placeholder titles like `Ticket` or `Ticket: Description`, and do not pad the plan with obvious steps.

## 4. Sync (only if requested)

- Existing ticket: update that same ticket (never create a replacement). Write the plan into the body, or post it as a comment when overwriting the body would lose the author's original text. When unsure, ask (non-interactive: post the plan as a comment).
- No ticket: create one with the plan, assigned to `@me`.

Use the commands from `references/tickets.md`, with bodies passed via temp file.

## Output

The plan as shown above, followed by `Ticket: <url | not synced>`.
