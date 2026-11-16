# nfse-technical-note-analysis

Analyzes an NFS-e Nacional technical note (Nota Técnica) against your codebase and writes an issue body: homologation and production dates, the technical changes, the code changes required, and a homologation-first rollout plan.

**Requires:** a [project profile](../README.md#project-profiles) at `docs/ai/nfse-technical-note-analysis.md` (recommended; without it the skill builds the code map by searching). For PDFs: `pdftotext`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| Note | NT text, PDF, or URL | asks |
| Source URL | official URL | the note URL |
| History | text of the official "Atualizações e implantações" page | read from gov.br when online |
| Output | path of the issue body | printed |
| Profile | path | `docs/ai/nfse-technical-note-analysis.md` |

Start the profile from [`references/profile-template.md`](../../.rulesync/skills/nfse-technical-note-analysis/references/profile-template.md): scope, documents to read, code map, implementation rules, release facts.

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/nfse-technical-note-analysis https://www.gov.br/nfse/.../nt-007.pdf` |
| Codex CLI | `$nfse-technical-note-analysis note-text /tmp/nt/note.txt output /tmp/nt/issue.md` |
| OpenCode | "use the nfse-technical-note-analysis skill on NT 007" |

## What it does

1. Identifies the note and its scope, and extracts the homologation and production dates with their source. It never estimates an unpublished date.
2. Lists each technical change (section, XML path or API, old and new behavior) and rates it required, optional, or not applicable for the profile's scope.
3. Confirms the current behavior in code (`path:line`) before proposing changes that follow the profile's implementation rules, with tests.
4. Plans the rollout backwards from the production date and flags it at risk when time is short.

## Side effects

Writes the output file only. It does not call GitHub or change the repository.
