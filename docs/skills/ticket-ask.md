# ticket-ask

Answers a question about a ticket using its full discussion and the codebase, and posts the answer as a comment when you ask for it. Replaces Kompass `/ticket/ask`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Ticket | reference/URL | required |
| Question | free text | latest unanswered question in the thread |
| Post | "post it" / "reply on the ticket" | shows a draft and asks |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/ticket-ask #42 is the cache invalidated on role change?`, `/ticket-ask ABC-123 post the answer` |
| Codex CLI | `$ticket-ask #42` |
| OpenCode | "use the ticket-ask skill to answer the open question on #42" |

## What it does

Loads the ticket and comments, answers from the discussion plus code (citing `path:line`), says plainly what is unknown instead of guessing, and drafts a short reply that leads with the answer. It posts the reply only when you ask or approve.

## Side effects

Posts one comment, only with your approval. It never edits, commits, or pushes code.
