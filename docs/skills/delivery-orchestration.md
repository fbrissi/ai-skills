# delivery-orchestration

Fourth step of the [delivery flow](../delivery-flow.md). Never codes. Loads the milestone's issues, marks `status:done` the ones whose task PR merged into the milestone branch, builds the dependency graph, and creates the milestone (release) branch from `release-branch-template` (default `release/<milestone-slug>`) from `base-branch` if missing. Each issue that is `ready`, has every dependency done, and fits in the `max-parallel` free slots gets a feature branch from `feature-branch-template` (default `feature/<milestone-slug>-<issue>-<slug>`) from the milestone branch; existing branches under older names are reused, never renamed, `status:in-progress`, and an implementation start: in CI it dispatches `implement-workflow` with the dispatch inputs `issue`, `branch`, and `base_branch` (the milestone branch); locally it hands the task to the `task-implementer` agent, or to `dev`, `quality-cycle`, and `pr-create` in turn. Task PRs always target the milestone branch. One milestone PR, from the milestone branch into `base-branch`, aggregates them: it is opened as a draft once the milestone branch has a commit, its body (every issue with `Closes #<n>`, status, and task PR) is kept current on every run, and it is marked ready for review, with `requested-by` as reviewer, when every issue is done and, when the profile sets `Release notes file`, the release notes are merged: once every issue is done it writes the release notes section and the version files on a branch from `release-notes-branch-template` and opens their PR into the milestone branch, which follows the same PR follow-up as a task PR. It always needs a human approval. A failed push, PR command, or dispatch stops the steps that depend on it and leaves the issues as they were. When it merges, the next run moves every issue to `done` and closes the milestone. It never merges and never waits: re-run it when a task PR or the milestone PR merges. Dispatches pass `requested_by` when the implement workflow declares it.

**Requires:** `git`, `gh` (authenticated; `actions: write` to dispatch workflows). Optional [delivery profile](../delivery-flow.md#profile) at `docs/ai/delivery.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| `milestone` | GitHub milestone title | required |
| `base-branch` | branch | the default branch |
| `implement-workflow` | workflow file | `ai-implement.yml` |
| `max-parallel` | number | `3` |
| `release-notes-file`, `release-heading`, `release-version`, `version-files`, `release-notes-branch-template` | see [release notes](../../shared/references/delivery-profile.md#release-notes) | none (no release notes step), `## {version}`, `{name}`, none, `feature/{release-slug}-release-notes` |
| `status-labels`, `project`, `project-status-field`, `project-status-options` | see [work status](../../shared/references/work-status.md) | `status:<state>`, none, `Status`, Title Case of the state |
| `context` | free text | none |
| `requested-by` | GitHub login of the person who started the flow | the milestone's `requested-by` marker |
| `profile` | path | `docs/ai/delivery.md` |

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/delivery-orchestration milestone JIRA:ABC-123` |
| Codex CLI | `$delivery-orchestration milestone "Sprint 4" max-parallel 2` |
| OpenCode | "use the delivery-orchestration skill on milestone Sprint 4" |

## Side effects

Branches, labels, Project status, workflow dispatches (CI) or implementation runs (local), the release notes branch and PR, the draft milestone PR and its updates, and closing the milestone after its PR merges. Never merges.
