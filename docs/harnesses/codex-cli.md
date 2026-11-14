# Codex CLI

| | |
| --- | --- |
| Install | `npx skills add fbrissi/ai-skills -a codex` (add `-g` for your user) |
| Installed into (project) | `.agents/skills/` |
| Installed into (user) | `~/.agents/skills/` |
| Update | `npx skills update` |
| Rulesync target (alternative) | `codexcli` |
| Docs | [Codex skills](https://developers.openai.com/codex/skills) |

Folders the harness reads natively:

| | |
| --- | --- |
| Project skills | `.agents/skills/<name>/SKILL.md` (scanned from the working directory up to the repo root) |
| User skills | `~/.agents/skills/<name>/SKILL.md` |

## Invoke

- **Mention with `$`**: type `$` and pick the skill, then add your request.
  ```text
  $pr-fix 123 loop
  $ticket-plan #42 and sync it to the ticket
  $ship
  ```
- **Picker**: run `/skills` to browse and select one.
- **Automatic**: Codex picks a skill when the task matches its description.

## Notes

- `.agents/skills/` is the open Agent Skills location, so other tools read it too (OpenCode and Cursor among them). See [duplicates](../install-in-a-project.md#avoid-duplicate-skills).
- Codex detects skill changes automatically. Restart it if an update does not show up.
- Long-running steps (`gh pr checks --watch` in `pr-fix` loop mode) need a sandbox/approval policy that allows network access and long commands.
