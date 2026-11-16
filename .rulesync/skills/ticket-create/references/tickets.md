# Ticket providers

Resolve a ticket reference to a provider, then use the matching commands. Prefer an MCP/connector tool when the harness has one for that tracker; fall back to the CLI.

| Reference shape | Provider | Load (with discussion) | Comment | Update | Create |
| --- | --- | --- | --- | --- | --- |
| `https://github.com/o/r/issues/N`, `#N` (GitHub remote), `o/r#N` (pass as `N -R o/r`) | GitHub | `gh issue view <ref> --comments` | `gh issue comment <ref> --body-file <f>` | `gh issue edit <ref> --title <t> --body-file <f>` | `gh issue create --title <t> --body-file <f> --assignee @me` |
| `https://gitlab.*/g/p/-/issues/N`, `#N` (GitLab remote) | GitLab | `glab issue view <ref> --comments` | `glab issue note <ref> --message "$(cat <f>)"` | `glab issue update <ref> --title <t> --description "$(cat <f>)"` | `glab issue create --title <t> --description "$(cat <f>)" --assignee <your-username> --yes` |
| Jira / Linear / other tracker URL or key (`ABC-123`) | Tracker MCP | Use the tracker's MCP/connector tool | same | same | same |
| Path to a local file (`.md`, `.txt`) | File | Read the file | Not supported: report the answer instead | Edit the file only when asked | Not supported |
| Free text | Inline request | Use the text as the request | n/a | n/a | n/a |

Rules:

- Detect GitHub vs GitLab from `git remote get-url origin` when the reference is a bare `#N`.
- Always write multi-line bodies to a temp file: pass `--body-file <f>` to `gh`, and `"$(cat <f>)"` to `glab` (it has no body-file flag). Delete the file afterwards.
- `@me` works for `gh`. For `glab`, get your username with `glab api user --jq .username`.
- Treat the ticket body **and its comments** as requirements. Later comments that set constraints, renames, scope cuts, or decisions override the original body.
- Review linked images, screenshots, and attachments when they affect requirements; if one cannot be opened, say so and continue only if the rest is enough.
- If the provider CLI/tool is missing or unauthenticated, stop and say which one is needed. Do not guess ticket contents.
