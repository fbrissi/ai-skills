# Ticket providers

Resolve a ticket reference, find the access this harness and project actually expose for that tracker, then load or change the ticket with it. Never assume one provider or tool.

## 1. Detect the reference

| Reference shape | Provider |
| --- | --- |
| `https://github.com/o/r/issues/N`, `#N` (GitHub remote), `o/r#N` (pass as `N -R o/r`) | GitHub |
| `https://gitlab.*/g/p/-/issues/N`, `#N` (GitLab remote) | GitLab |
| Tracker URL (for example `https://<site>.atlassian.net/browse/ABC-123`, `https://linear.app/<team>/issue/ABC-123`) | The tracker the URL belongs to |
| Bare key `ABC-123` that is clearly a reference (see below) | Jira, Linear, or another key-based tracker |
| Path to a local file (`.md`, `.txt`) | File |
| Free text | Inline request |

- Detect GitHub vs GitLab from `git remote get-url origin` when the reference is a bare `#N`.
- Look for references in the given input first, then the PR title and body, commit messages, and the branch name.
- Treat a bare key as a ticket only when it is clearly a reference: a tracker link, a line such as `Closes ABC-123`, `Refs: ABC-123`, or `Ticket: ABC-123`, a `## Ticket` section, or the branch prefix (`feature/dev-420-x` -> `DEV-420`). Do not treat every `ABC-123`-looking token (versions, error codes, model names, `UTF-8`) as a ticket.
- A bare key does not name its tracker. Use the project's guidance (`AGENTS.md`, `CLAUDE.md`, a profile file) or links elsewhere in the PR, commits, or repo to find which tracker and site it belongs to. If several trackers are available and none is indicated, try each read-only tool that accepts the key.

## 2. Find access

Use the first option that is available and authenticated for that tracker. Discover by capability, not by a fixed tool name:

1. **MCP server or connector tool** for that tracker (Atlassian/Jira, Linear, GitHub, GitLab, and so on). Look through the tools the harness exposes for one whose name or description says it reads issues, tickets, or work items of that tracker.
2. **Project or harness custom tool** that loads tickets. Example: an OpenCode project tool in `.opencode/tools/` (such as a `*_ticket` tool that loads Jira issues), or a tool declared in the project's harness config. Check the tool list first, then the project's harness config and `AGENTS.md` for one that is documented but not loaded.
3. **CLI** that is installed and authenticated: `gh` and `glab` (commands below), or a tracker CLI such as `jira`/`acli` or `linear`. Check with `command -v <cli>` and the CLI's own auth status or a read-only call, and use its built-in help for the exact subcommands.
4. **Public URL** that can be fetched without credentials. Never add tokens, cookies, or credentials to the request.

Use the same access for every later step on that ticket (comment, update). If the access you found is read-only, say so before a step that needs to write.

### Commands by provider

| Provider | Load (with discussion) | Comment | Update | Create |
| --- | --- | --- | --- | --- |
| GitHub | `gh issue view <ref> --comments` | `gh issue comment <ref> --body-file <f>` | `gh issue edit <ref> --title <t> --body-file <f>` | `gh issue create --title <t> --body-file <f> --assignee @me` |
| GitLab | `glab issue view <ref> --comments` | `glab issue note <ref> --message "$(cat <f>)"` | `glab issue update <ref> --title <t> --description "$(cat <f>)"` | `glab issue create --title <t> --description "$(cat <f>)" --assignee <your-username> --yes` |
| Other tracker | The access found above: its get/read action, including comments | Its comment action | Its update action | Its create action, assigned to you |
| File | Read the file | Not supported: report the answer instead | Edit the file only when asked | Not supported |
| Inline request | Use the text as the request | n/a | n/a | n/a |

- Prefer an MCP/connector tool over `gh`/`glab` when the harness has one for GitHub or GitLab; the CLI commands are the fallback.
- Always write multi-line bodies to a temp file: pass `--body-file <f>` to `gh`, and `"$(cat <f>)"` to `glab` (it has no body-file flag). Delete the file afterwards.
- `@me` works for `gh`. For `glab`, get your username with `glab api user --jq .username`.

## 3. When no access works

What happens next depends on the skill's purpose:

- **The ticket is the output or the source of work** (answering, planning, creating, or updating a ticket, or implementing from one): stop and say which ticket could not be loaded and which access would enable it (for example "an MCP server or tool for Jira, or an authenticated `jira` CLI").
- **The ticket is supporting context** (for example a code review): continue without it. Do the work on its own merits, skip any judgement that needs the ticket, and state once in the output, and in anything you publish, which ticket could not be loaded and which access would enable it. A missing ticket never blocks the rest of the skill or changes its output contract.
- **Non-interactive runs** (CI, `--print`, `opencode run`, scheduled jobs): never wait for input about ticket access. Apply the rule above.

## Using ticket content

- Treat the ticket body **and its comments** as requirements. Later comments that set constraints, renames, scope cuts, or decisions override the original body.
- Review linked images, screenshots, and attachments when they affect requirements; if one cannot be opened, say so and continue only if the rest is enough.
- Never guess ticket contents. If only part of the ticket loaded, say which part is missing.
- Send ticket data only back to the tool that loaded it. Do not paste it into other services, tools, or URLs; linking the ticket reference (for example in a PR body) is fine.
