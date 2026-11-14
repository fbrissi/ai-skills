# GitHub Copilot

| | |
| --- | --- |
| Install | `npx skills add fbrissi/ai-skills -a github-copilot` (add `-g` for your user) |
| Installed into (project) | `.agents/skills/` |
| Installed into (user) | `~/.copilot/skills/` |
| Update | `npx skills update` |
| Rulesync target (alternative) | `copilot` (`.github/skills/`) |
| Docs | [Agent Skills in VS Code](https://code.visualstudio.com/docs/agent-customization/agent-skills), [Copilot agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |

Folders the harness reads natively:

| | |
| --- | --- |
| Project skills | `.github/skills/<name>/SKILL.md` |
| User skills | `~/.copilot/skills/<name>/SKILL.md` |

## Invoke

- **VS Code chat (agent mode)**: type `/` and pick the skill, then add context.
  ```text
  /review-changes 123 and publish
  /ticket-ask #42 why do we cache tokens per tenant?
  /dev fix the flaky date parsing test
  ```
- **Automatic**: Copilot loads a skill when the request matches its description.
- **Copilot cloud agent / Copilot CLI**: skills in `.github/skills/` are loaded automatically for matching tasks.

## Notes

- Use agent mode. Skills that run `git`/`gh` need terminal tool access.
- In the cloud agent, `gh` uses the agent's token: posting PR replies and reviews depends on the permissions granted to it.
