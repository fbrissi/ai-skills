# NFS-e technical note analysis profile

Copy this template to `docs/ai/nfse-technical-note-analysis.md` in your repository and fill it in. Paths can move, so the skill confirms each one with a search before citing it.

```markdown
# NFS-e technical note analysis

## Scope
<How this system uses NFS-e: for example, issues DPS/NFS-e through the Emissor Nacional API for service providers, signs and validates in <component>, renders DANFSE. List what is out of scope, such as NFS-e Via or municipal-only panels.>

## Read first
1. <AGENTS.md: fiscal rules, tenancy, dates, currency>
2. <docs on earlier notes and what is implemented or deferred>
3. <architecture docs: schema revisions, field evolution, numbering, events>
4. <rejection-code catalog, release process>

## Code map
| Change kind | Where to look |
|---|---|
| Layout fields, XML paths, requiredness, domains | <paths> |
| Revision per environment (homologation vs production) | <paths> |
| Official XSD packages | <paths and the command that downloads them> |
| XML element order | <paths> |
| DPS builders and specialized groups | <paths> |
| Calculations and totals | <paths> |
| Saved data evolution and migrations | <paths and generator command> |
| Events (cancellation, substitution, new types) | <paths> |
| Signing and XSD validation | <paths> |
| Provider responses and rejection codes | <paths> |
| DANFSE layout | <paths> |
| Issuance routing (Nacional vs municipal) | <paths> |
| Form rendering | <paths> |
| Tests | <paths> |

## Implementation rules
- <for example: add a new revision instead of editing the production one>
- <commands to download XSDs, regenerate element order, generate migrations>
- <deprecate fields instead of removing them; no hardcoded fiscal formulas; catalog new error codes>

## Release facts
- <how and when production deploys; whether homologation ships inside the production release>
- <what runs automatically after a homologation change, such as revalidation>
- <how to roll back>

## Output
- Language: <English>

## Automation (read by the nfse-compliance agent; the skill ignores it)
- Tracker: <GitHub issues in owner/repo | GitLab project | Jira project>
- Labels: <nfse>; categories: <nfse:tributario, nfse:layout, nfse:api, nfse:eventos, nfse:danfse, nfse:validacao>
- Estimate scale: <Fibonacci points | GitLab weight | Jira story points>
- Due date field: <GitHub Project number and date field | milestone | tracker due date>
- Split into one issue per change: <no | yes>
- Implement optional changes: <no | yes>
- Base branch: <main>
- Auto-merge: <off | on>
- Max risk to merge: <2>
- Merge method: <squash>
- Required human approvals: <1>
- Risk floors: <paths or kinds of change and their minimum rating, e.g. fiscal formulas -> 4, migrations -> 4, production revision switch -> 4>
```
