# merge-risk

Rates the risk of an approved pull request reaching production on a 1-5 scale and decides MERGE or HOLD. It checks the gates first (CI green, human approval on the current head, no open threads, no hold labels), then rates the diff with a rubric plus the project's path floors. It merges only when auto-merge is on, every gate passes, and the rating is within the limit. Every decision is posted on the PR.

**Requires:** `gh` (authenticated), or `glab` on GitLab. Optional [project profile](../README.md#project-profiles) at `docs/ai/merge-risk.md`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| PR | number or URL | PR of the current branch |
| Mode | `report`, `decide` | `report` |
| Auto-merge | `on`, `off` | profile, otherwise `off` |
| Max risk | 1-5 | profile (per base, then general), otherwise 2 |
| Base branches | names or patterns (`release/*`) | profile, otherwise the default branch |
| Required human approvals | number | profile (per base, then general), otherwise 1 |
| Profile | path | `docs/ai/merge-risk.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/merge-risk/references/profile-template.md): auto-merge, max risk, base branches, merge method, required human approvals, an optional per-base table (max risk and approvals per base pattern, for example task PRs into `release/*` versus `main`), hold labels, and path floors.

With 0 required approvals for the base, an empty review decision passes and only changes requested (or a review required by branch protection) holds. Otherwise it counts human approvals on the head commit from the reviews, never the review decision alone.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/merge-risk 42`, `/merge-risk 42 decide auto-merge on` |
| Codex CLI | `$merge-risk https://github.com/acme/app/pull/42` |
| OpenCode | "use the merge-risk skill on PR 42" |

## Rating

| Rating | Meaning |
| --- | --- |
| 1 | Docs, comments, tests only |
| 2 | Localized logic with tests, no contract or data change |
| 3 | Shared code paths, additive API or schema, dependency updates |
| 4 | Migrations, money or fiscal calculations, auth, breaking contracts, integrations, infrastructure |
| 5 | Irreversible data changes, untested security-sensitive code, production switches before an official date |

Path floors from the profile set minimums. One mitigation verified from the diff or CI (flag off by default in the code, homologation-only path, a passing staging check or deployment on the head commit) lowers the rating by one, never below a floor; claims made only in the PR text do not count. Untested behavior changes add one.

## Side effects

`report`: none. `decide`: a PR comment, an optional hold label, and the merge itself when allowed. It never uses admin merges or bypasses branch protection.
