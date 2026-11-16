# Claude Code

| | |
| --- | --- |
| Install | `npx skills add fbrissi/ai-skills -a claude-code` (add `-g` for your user) |
| Installed into (project) | `.claude/skills/` (a symlink to `.agents/skills/` when other agents are selected too) |
| Installed into (user) | `~/.claude/skills/` |
| Update | `npx skills update` |
| Rulesync target (alternative) | `claudecode` |
| Docs | [Agent Skills in Claude Code](https://code.claude.com/docs/en/skills) |

Folders the harness reads natively:

| | |
| --- | --- |
| Project skills | `.claude/skills/<name>/SKILL.md` |
| User skills | `~/.claude/skills/<name>/SKILL.md` |

## Invoke

- **Slash command**: every skill is also a slash command. Text after the name is passed as arguments.
  ```text
  /pr-fix 123 auto
  /review-changes main
  /dev https://github.com/acme/app/issues/42 and ship it
  ```
- **Automatic**: Claude loads a skill when your request matches its description, e.g. "address the review comments on this PR".
- Run `/skills` to list what is loaded.

## Notes

- Name clashes: Claude Code ships built-in `/review` and `/code-review`, which is why this library uses `review-changes`.
- Approval gates (`pr-fix` review mode, `todo`, `pr-create` ticket question) use Claude Code's question prompt when available.
- `review-changes` splits very large reviews across subagents.
- If a newly installed skill does not appear, start a new session.
