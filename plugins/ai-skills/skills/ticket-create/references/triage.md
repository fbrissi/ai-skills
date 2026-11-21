# Ticket triage fields

Apply these fields only when the request, a calling agent, or a profile asks for triage. Values come from the caller's profile first, then the request, then the defaults below. Use the tracker access found with `tickets.md`.

## Fields

| Field | Default | How to decide |
| --- | --- | --- |
| Estimate (points) | Fibonacci `1, 2, 3, 5, 8, 13` | Size by complexity, uncertainty, and effort together, relative to the repo's history when visible. Above 13, split the work and estimate each part. State the main driver in one line. |
| Category | The profile's label set; otherwise none | One or more labels that describe the kind of change. Use only labels that already exist unless the profile allows creating them. |
| Priority | `critical`, `high`, `medium`, `low` | From impact and deadline: a deadline within 7 days or production impact is `critical`; within 30 days `high`. |
| Due date | none | The date the work must be done by: an official deadline, or the plan's recommended date that leaves the buffers it lists. Always absolute (`YYYY-MM-DD`). |
| Owner | the profile's owner, otherwise `@me` | |

## Writing them per provider

| Provider | Labels / priority | Estimate | Due date |
| --- | --- | --- | --- |
| GitHub | `gh issue edit <n> --add-label <l>` | A Projects number field (`gh project item-edit`), else a `Estimate: <n> pts` line in the body | A Projects date field (`gh project item-edit --date`), else a milestone with that due date, else a `Due: <date>` line in the body |
| GitLab | `glab issue update <n> --label <l>` | `glab issue update <n> --weight <n>` | `glab issue update <n> --due-date <YYYY-MM-DD>` |
| Jira and other trackers | Its labels/priority fields | Its story points field | Its due date field |

- Look up project and field ids once (`gh project field-list <project> --owner <owner> --format json`) and reuse them.
- When a field cannot be written with the access you have, put the value in the body under a `## Triage` section and say which field was not set.
- Never change fields the triage did not decide (assignees chosen by people, existing estimates set by people) unless asked.
