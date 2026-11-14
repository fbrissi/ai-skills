# OpenCode

| | |
| --- | --- |
| Install | `npx skills add fbrissi/ai-skills -a opencode` (add `-g` for your user) |
| Installed into (project) | `.agents/skills/` |
| Installed into (user) | `~/.config/opencode/skills/` |
| Update | `npx skills update` |
| Rulesync target (alternative) | none needed: OpenCode reads the `claudecode` and `codexcli` folders |
| Docs | [OpenCode skills](https://opencode.ai/docs/skills/) |

Folders the harness reads natively:

| | |
| --- | --- |
| Project skills | reads `.claude/skills/` and `.agents/skills/` (native folder: `.opencode/skills/`) |
| User skills | reads `~/.claude/skills/` and `~/.agents/skills/` (native folder: `~/.config/opencode/skills/`) |

## Invoke

OpenCode skills are **not** slash commands. The model loads them through its built-in `skill` tool, either automatically or when you name the skill:

```text
use the pr-fix skill on PR 123 in auto mode
use the review-changes skill against main
plan issue #42 with the ticket-plan skill and sync it
```

## Notes

- Skill access can be restricted per agent with `permission.skill` (`allow` / `ask` / `deny`) in `opencode.json`.
- OpenCode also reads `.claude/skills/` and `.agents/skills/`. If you install for Claude Code as well, the `skills` CLI symlinks `.claude/skills/` to `.agents/skills/`, and OpenCode may list each skill twice. The content is identical; leave `claude-code` unselected if you only use OpenCode (see [duplicates](../install-in-a-project.md#avoid-duplicate-skills)).
- Kompass users: these skills replace `/pr/fix`, `/ship`, and the rest of the set. See the [analysis](../kompass-analysis.md). Both can stay installed (the names differ), but use one of them per task.
