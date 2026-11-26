# Ticket triage fields

Apply these fields only when the request, a calling agent, or a profile asks for triage. Values come from the caller's profile first, then the request, then the defaults below (the delivery skills resolve them as their `delivery-profile.md` says). Use the tracker access found with `tickets.md`.

## Fields

| Field | Default | How to decide |
| --- | --- | --- |
| Category | The profile's label set; otherwise none | One or more labels that describe the kind of change. Use only labels that already exist unless the profile allows creating them. |
| Priority | `critical`, `high`, `medium`, `low` (or the profile's options, for example `Urgent, High, Medium, Low`, in that order) | From impact and deadline: a deadline within 7 days or production impact is the highest; within 30 days the next one. |
| Size | The profile's options (for example `XS, S, M, L, XL`) | Relative size of the work: complexity, uncertainty, and effort together. Above the largest size, split the work and size each part. |
| Estimate (points) | Fibonacci `1, 2, 3, 5, 8, 13`; with a profile scale (for example `XS=3, S=5, M=8, L=13, XL=21`), the value for the Size | Follow the Size through the scale when there is one. State the main driver in one line. |
| Effort | The profile's options (for example `High, Medium, Low`) | Hands-on work required, independent of priority. |
| Start date / Target date | When the source has no due date or deadline: Start today (or the day after the latest Target of the issues it depends on); Target the Start plus the working days the Estimate implies (from similar past work, else one working day per point), or 10 working days when there is no Estimate yet | Start: when the work can begin (after its dependencies and earlier work in the same milestone). Target: the deadline, or the plan's recommended date that leaves its buffers. Always absolute (`YYYY-MM-DD`), and never a target before the start. When the profile defines these fields, never leave them empty: use the default and say so in the output. |
| Owner | the caller's assignee (for example `requested-by`), else the profile's owner, otherwise `@me` (none when the profile says so, or with a GitHub App or bot token, where `@me` fails) | |

When a profile defines the triage fields (for example the `## Triage` section of the delivery profile), a field whose profile key is missing is skipped: say which ones in the output.

## Estimating from history

Prefer evidence over intuition when the repository has history:

1. Find closed issues or merged PRs similar in area and kind (same labels, same paths): `gh issue list --state closed --label <category> --json number,title,closedAt`, and the PRs that closed them (`gh pr list --state merged --search "<keywords>" --json number,title,additions,deletions,changedFiles,createdAt,mergedAt`).
2. Read their Size and Estimate where they were set, and their actual cost: time from first commit to merge, diffstat, and number of PRs.
3. Place the new work relative to them, and cite one or two of them in the driver line (`like #41, M, 3 days, ~400 lines`).

Without comparable history, estimate from the plan and say so.

## Kinds of fields on GitHub

| Kind | Holds | Read and write |
| --- | --- | --- |
| Labels | Category (and Priority when no field exists for it) | `gh issue edit <n> --add-label <l>` |
| Project fields | Single-select (for example `Size`, `Status`), number (`Estimate`), date | Ids from `gh project field-list <number> --owner <owner> --format json`; write with `gh project item-edit` (`--single-select-option-id`, `--number`, `--date`) after `gh project item-add` |
| Organization issue fields | Fields on the issue itself, shared by every repository of the organization: single-select (for example `Priority`, `Effort`), date (`Start date`, `Target date`), number, text | List them with GraphQL `organization(login: "<org>") { issueFields }` (ids and option ids); write with the `setIssueFieldValue` mutation on the issue's node id (`gh issue view <n> --json id`) |

- Look up project, field, and option ids once per run and reuse them. Match field and option names case-insensitively.
- Organization issue fields are newer than most clients: confirm the shapes with schema introspection before the first call (`gh api graphql -f query='{ __type(name: "SetIssueFieldValueInput") { inputFields { name type { name kind ofType { name kind } } } } }'`), and build each request from that. If the API reports the feature as unavailable, treat the fields as missing.
- Some project fields mirror organization issue fields. When both exist for the same value, write the issue field only.
- When a field cannot be written with the access you have (or has no matching option), put the value in the body under a `## Triage` section and say which field was not set.

## Other providers

| Provider | Labels / priority | Estimate | Due date |
| --- | --- | --- | --- |
| GitLab | `glab issue update <n> --label <l>` | `glab issue update <n> --weight <n>` | `glab issue update <n> --due-date <YYYY-MM-DD>` |
| Jira and other trackers | Its labels/priority fields | Its story points field | Its due date field |

On GitHub without any project or issue field for a value: Estimate goes in an `Estimate: <n> pts` body line; the due date goes on a milestone with that due date, else a `Due: <date>` body line.

## Values set by people

Never overwrite a value a person set (assignees, estimates, priority, dates) unless asked, or unless a refinement changed the issue's scope: then update it and comment on the issue with the old value, the new value, and why. To tell them apart, record the values you set in the issue body as an HTML comment, replaced on every write (`<!-- triage: size=M estimate=8 effort=Medium priority=High start=2026-01-05 target=2026-01-16 -->`); a current value that differs from that record was set by a person.
