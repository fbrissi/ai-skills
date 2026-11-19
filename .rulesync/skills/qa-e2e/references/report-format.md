# QA report format

Load this when writing the report. Keep the headings; drop sections that are empty, except the verdict.

```markdown
# QA report: <scope>

- Date: <YYYY-MM-DD>
- Environment: <local | staging URL>
- Commit or branch: <sha / branch>
- Scenarios: <folder or tags>
- Viewports: desktop <1440x900>, mobile <375x812>
- Verdict: **<APPROVED | CHANGES REQUIRED>**

## Summary

| Scenario | Feature file | Result | Notes |
| --- | --- | --- | --- |
| Owner invites a new member and the invitee accepts | team/invite-teammate.feature | pass | |
| Member cannot invite people | team/invite-teammate.feature | fail | F1 |
| Owner pays with a test card | billing/checkout.feature | blocked | payment test keys not configured |

Totals: <passed> passed, <failed> failed, <blocked> blocked.

## Findings

### F1 [blocker] Member can see the invite action

- Scenario: team/invite-teammate.feature › Member cannot invite people
- Viewport: desktop 1440x900
- Type: functional | ux | console | network | exploratory
- Pre-existing: no | yes | unknown
- Steps to reproduce:
  1. Sign in as the seeded "member" user.
  2. Open Team members.
- Expected: the invite action is not shown.
- Actual: the "Invite" button is shown and opens the invite form.
- Evidence: <report-name>/f1-member-invite.png; console: none; request: none
- Suggested area: <route, view, or permission check, if obvious; otherwise omit>

## Not covered

- <scenarios or areas skipped, and why>

## Notes for the developer

- <setup quirks, flaky behavior, data that had to be reset>
```

On a re-run (for example inside `quality-cycle`), add a `## Re-test` section listing each earlier finding ID as `fixed`, `still failing`, or `not re-tested`, plus any regression found in the touched areas.
