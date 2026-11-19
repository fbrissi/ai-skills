# bdd-scenarios

Maps an application's features from its routes, views, API, docs, and tests, then writes executable BDD feature files (Gherkin) that a QA agent runs in a real browser. Adds a feature inventory, a coverage matrix (feature × scenario × role), and a list of rules that need owner input.

**Requires:** a [project profile](../README.md#project-profiles) at `docs/ai/bdd-scenarios.md` (or answers to a few questions).

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Scope | `whole app`, a base branch, `uncommitted`, a PR, or named features | current branch vs its base, otherwise the whole app |
| Profile | path | `docs/ai/bdd-scenarios.md` |
| Focus | free text (roles, areas, priorities) | none |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/bdd-scenarios/references/profile-template.md): features folder, step language, source paths, roles and tags, test data sources, mail catcher, sandboxes, mobile-sensitive screens, custom tags.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/bdd-scenarios main`, `/bdd-scenarios whole app` |
| Codex CLI | `$bdd-scenarios the invitation flow` |
| OpenCode | "use the bdd-scenarios skill for this branch" |

## What it does

1. Builds a feature inventory from docs, routes, API authorization, existing tests, and outbound side effects (e-mail, files, payments). For a diff, it lists changed capabilities and their regression neighbours.
2. Plans happy path, validation, permission (each denied role, anonymous, other tenant), state, and e-mail-link scenarios per capability.
3. Writes one `.feature` file per capability in business language, tagged for priority (`@p1`-`@p3`), `@smoke`, roles, viewports (`@mobile`, `@desktop`), `@email`, and external sandboxes, with data setup notes. Test data only; never real credentials.
4. Writes the inventory, coverage matrix, and **Unmapped / needs owner input** list to the folder's `README.md`.

Pairs with [`qa-e2e`](qa-e2e.md), which executes the scenarios.

## Side effects

Writes `.feature` files and a `README.md` under the features folder.
