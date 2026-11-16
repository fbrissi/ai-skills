# PR and ticket body format

Use this structure for pull requests and change-summary tickets. If the repository has a PR template (`.github/pull_request_template.md`, `.gitlab/merge_request_templates/`), fill that template instead and only borrow the writing rules below.

```md
## Ticket
<ticket URL, or SKIPPED>

## Description
<2-4 sentences: what changed and why it matters. No implementation walkthrough.>

## Checklist
### <Outcome area 1>
- [ ] <what changed, for a human reader>

### <Outcome area 2>
- [ ] <...>

### Validation
- [ ] Verify that <observable result>
- [ ] Confirm that <observable result>
```

Writing rules:

- Title: at most 70 characters, describes the delivered outcome, not the branch name. Follow the repo's commit/PR title convention when one exists.
- 2-4 outcome sections named after user-facing areas (never generic labels like "Changes" or "Files").
- Merge tiny themes; never one section per file. Do not restate the diff.
- Scope comes from the commits ahead of base, not from the branch name or files only on base.
- Validation items are reviewer steps (`Verify that…`, `Confirm that…`, `Check that…`), never status notes such as "tests not run".
- Omit `## Ticket` for tickets (only PRs link a ticket).
