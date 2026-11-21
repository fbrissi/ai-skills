---
name: ticket-ask
description: >-
  Answer a question about a ticket using its full discussion and the codebase,
  and post the answer as a ticket comment once the user asks for it. Read-only
  for code. Use when the user asks to answer, reply to, or clarify something on
  a ticket or issue.
---
# Ticket ask

Understand and reply. Never edit, commit, or push code in this skill.

## Inputs

- **Ticket**: a reference or URL (required).
- **Question**: the rest of the request. If it is empty, take the latest unanswered question in the ticket thread, or derive it from the conversation.
- **Post**: post only when the user asks to post, reply, or comment on the ticket. Otherwise show the draft and ask whether to post it.

Stop with `Unable to answer ticket: missing ticket or question` if either one cannot be determined.

## Steps

1. Load the ticket body and comments following `references/tickets.md`. If no access can load it, stop and say which tool, MCP server, or CLI is needed.
2. Answer from the ticket discussion, plus repository context when the question is technical (cite `path:line` for code claims). Do not invent facts. If something is unknown, say so and state what would settle it.
3. Keep it short: lead with the direct answer, then supporting detail. Match the tone of the thread.
4. When posting is requested or approved, post it as a comment using the provider's comment command (body via temp file).

## Output

```text
Answered: <ticket url>
<the posted answer, or the draft when not posted>
```
