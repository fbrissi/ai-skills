# Cursor

| | |
| --- | --- |
| Install | `npx skills add fbrissi/ai-skills -a cursor` (add `-g` for your user) |
| Installed into (project) | `.agents/skills/` |
| Installed into (user) | `~/.cursor/skills/` |
| Update | `npx skills update` |
| Rulesync target (alternative) | `cursor` (`.cursor/skills/`) |
| Docs | [Cursor Agent Skills](https://cursor.com/docs/skills) |

Folders the harness reads natively:

| | |
| --- | --- |
| Project skills | `.cursor/skills/<name>/SKILL.md` (also reads `.agents/skills/`) |
| User skills | `~/.cursor/skills/<name>/SKILL.md` |

## Invoke

- **Slash command in Agent chat**: type `/`, search for the skill, and add your request.
  ```text
  /pr-create skip
  /todo docs/TODO.md once
  /learn packages/api
  ```
- **Automatic**: the agent applies a skill when the request matches its description.

## Notes

- Cursor ships its own `/review`. Use `/review-changes` for this library's reviewer.
- The Cursor CLI's `/` menu only scans `.cursor/skills/`. A project install by the `skills` CLI goes to `.agents/skills/`, so if the Cursor CLI does not list the skills, install them with Rulesync's `cursor` target instead.
- Skills invoked with `/` apply to that one message. Re-invoke for follow-ups that need the full workflow.
