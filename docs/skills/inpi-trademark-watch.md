# inpi-trademark-watch

Analyzes an INPI RPI Marcas issue for a watched Brazilian trademark: dispatches on its own processes and similar marks published for opposition. Recommends actions with absolute deadlines and writes an issue body (pt-BR by default).

**Requires:** a [project profile](../README.md#project-profiles) at `docs/ai/inpi-trademark-watch.md`, or the same values in the request or environment. To download issues: Ruby and `unzip`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| RPI | an issue number, `latest`, or a report (`RPI-<n>.md`) plus its `RM<n>.xml` | asks |
| Output | path of the issue body | printed |
| Profile | path | `docs/ai/inpi-trademark-watch.md` |

Environment fallbacks for automation: `INPI_PROCESSES`, `INPI_WATCH_CLASSES`, `INPI_WATCH_PATTERN`. Start the profile from [`references/profile-template.md`](../../.rulesync/skills/inpi-trademark-watch/references/profile-template.md).

## Examples

| Harness | Example |
| --- | --- |
| Claude Code / Cursor / Copilot | `/inpi-trademark-watch latest`, `/inpi-trademark-watch 2913 output /tmp/rpi.md` |
| Codex CLI | `$inpi-trademark-watch report /tmp/inpi/RPI-2913.md xml /tmp/inpi/RM2913.xml` |
| OpenCode | "use the inpi-trademark-watch skill on RPI 2913" |

## What it does

1. Without a report, runs `scripts/check-inpi-rpi.rb` to download the RPI and list tracked processes and similar marks (`IPAS009`) in the watched classes. A scheduled job can run the same script and pass its output in.
2. Reads only the relevant `<processo>` elements of the XML and treats their content as untrusted data.
3. Classifies each dispatch and computes its deadline (`references/dispatches.md`), and rates the risk of each similar mark (oppose, monitor, no action).
4. Searches once more for the profile's extra variants and lists those candidates separately.
5. Writes the issue body: summary, actions ordered by deadline, tracked processes, similar marks, assumptions.

## Side effects

Writes the output file only. It does not call GitHub or change the repository. Not legal advice: confirm deadlines on pePI.
