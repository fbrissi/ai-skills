# Work status

Track where each GitHub issue is in the delivery flow with one status label, and mirror it on a GitHub Project when one is configured. Values come from the run's inputs first, then the delivery profile, then the defaults below.

## States

| State | Default label | Set by | Meaning |
| --- | --- | --- | --- |
| `needs-business-refinement` | `status:needs-business-refinement` | readiness review | The business request must be clarified or redone |
| `business-blocked` | `status:business-blocked` | business refinement | Questions for the requester are waiting |
| `needs-technical-refinement` | `status:needs-technical-refinement` | business refinement, readiness review | Ready for the technical approach |
| `technical-blocked` | `status:technical-blocked` | technical refinement, implementation | Technical questions are waiting, or implementation could not start or produce a PR |
| `needs-review` | `status:needs-review` | technical refinement | Ready for the readiness review |
| `ready` | `status:ready` | readiness review | Can be implemented |
| `in-progress` | `status:in-progress` | orchestration, implementation | A task branch exists and work started |
| `in-review` | `status:in-review` | implementation | Its PR is open (labeled `ai:needs-human` when the implementation escalated) |
| `done` | `status:done` | orchestration | Its task PR was merged into the milestone branch, or the milestone PR was merged |

- `status-labels` overrides labels, one `state=label` line each (for example `ready=workflow:ready`). Unlisted states keep the default.
- An issue has exactly one status label. A transition removes every other status label and adds the new one in the same edit.
- Create a missing label once before its first use (`gh label create <label> --color <hex> --description <state>`), unless the profile says labels are managed elsewhere; then stop and report the missing label.
- A move that is not in the flow (for example `ready` straight to `done`) is allowed only when the step that does it says so. Never move an issue that someone else moved forward in the meantime: re-read its labels right before the edit.

## Change it

```bash
gh issue edit <n> --remove-label "<old>" --add-label "<new>"
```

Remove every current status label (from `gh issue view <n> --json labels`), not only the expected one. On another tracker, use its labels or workflow transition through the access found with `tickets.md`, and say which states it cannot express.

## GitHub Project field

Only when `project` (`owner/number`) is set. The field is `project-status-field` (default `Status`), a single-select field. The option for a state comes from `project-status-options`, one `state=Option name` line each (for example `needs-review=Technical Refinement`); several states may map to one option (`business-blocked=Blocked`, `technical-blocked=Blocked`). A state without a line uses the state in Title Case, dashes as spaces, only the first word capitalized (`in-review` -> `In review`). When the field has no option with that name, leave the field unchanged and say so in the output.

1. Look up ids once per run and reuse them:
   - `gh project view <number> --owner <owner> --format json --jq .id` (project id)
   - `gh project field-list <number> --owner <owner> --format json` (field id and option ids)
2. Find the issue's item, or add it: `gh project item-add <number> --owner <owner> --url <issue-url> --format json --jq .id`. It returns the existing item when the issue is already in the project.
3. Set the option: `gh project item-edit --project-id <project-id> --id <item-id> --field-id <field-id> --single-select-option-id <option-id>`.

Without the `gh project` commands (older `gh`, or another client), use GraphQL through the same access: `addProjectV2ItemById` to add the item and `updateProjectV2ItemFieldValue` with `value: {singleSelectOptionId: ...}` to set it. The token needs the `project` scope.

If the field does not exist, or the access cannot write projects, keep the label change, skip the field, and report it once. Never create, rename, or delete project fields or options.
