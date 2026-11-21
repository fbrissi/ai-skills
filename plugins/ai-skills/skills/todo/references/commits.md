# Commit messages

1. Follow the repository's documented convention first (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, commitlint config, recent `git log --oneline -15`).
2. Otherwise use Conventional Commits:

```text
type: concise summary under 72 chars

- grouped change
- grouped change
```

- `type` is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`.
- Add 2-5 bullets only for non-trivial changes; a one-line message is fine when a body adds nothing.
- Stage deliberately: prefer explicit paths over `git add -A` when the worktree contains unrelated changes, and never stage secrets, `.env` files, dumps, or build artifacts.
- Never use `--no-verify`. If a hook fails, fix the cause and create a new commit (do not amend someone else's commit).
- Never create an empty commit.
- Add the harness's co-author/attribution trailer only if the harness or user instructions require one.
