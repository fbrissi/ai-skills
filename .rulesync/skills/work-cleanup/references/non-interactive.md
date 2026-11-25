# Non-interactive runs

Load this at any point where the skill would ask the user, wait for an approval, or ask for a confirmation.

## Detect

A run is non-interactive when `CI` or `GITHUB_ACTIONS` is `true` in the environment, or when the caller (a workflow prompt or a calling agent) says it is. Otherwise a person is in the conversation, and the skill asks as it says.

## Never ask, never wait

In a non-interactive run, at each question or approval point:

1. Use the non-interactive default the skill names for that point (for example `auto` mode, or the caller's input) and say so in the output.
2. With no such default, the item is blocked: post one blocker comment (below) and stop for that item. Continue with other items when the skill handles several.
3. Never guess a decision that belongs to a person (scope, product rules, accepting a risk, which release a fix goes into), never delete anything that needed a confirmation, and never treat silence as approval.

## Blocker comment

Post it on the issue or PR the run works on (on the source ticket when there is neither), as the identity the run has:

```md
<!-- ai-delivery blocker stage=<stage> -->
Blocked: <one line: what is missing and why it blocks>

@<requested-by> <the blocker in one to three lines>

1. <question>
2. <question>

<how to resume>
```

- `<stage>`: the stage the caller names (for example `implement`, `pr-fix`), else this skill's name.
- `@<requested-by>`: the person who started the flow, from the caller, the `<!-- ai-delivery requested-by=<login> -->` marker, or the issue or PR author. Skip the mention when the login is unknown or is a bot (ends in `[bot]`).
- `<how to resume>` (GitHub issues and PRs only): when the repository runs the resume workflow (the caller says so, or a workflow in `.github/workflows/` handles `/ai-resume` comments), write ``Reply `/ai-resume` (optionally with instructions on the next lines) to continue: <stage> -> <next stage>.``, with the stage after `/ai-resume` (`/ai-resume <stage>`) when no workflow handoff will follow this comment. Otherwise: `Answer here and run <stage> again.` Never use a checkbox to resume.
- On a re-run with the same questions, edit that comment instead of adding another. When the run cannot comment (no issue, PR, or write access), put the comment text in the output instead.

List the item in the output as `Blocked: <item>: <one line> | questions: <comment URL>`.
