# Merge risk profile

Copy this template to `docs/ai/merge-risk.md` in your repository and fill it in. Agents that merge (for example `incident-responder` and `nfse-compliance`) read their own profile's automation section first and fall back to this file.

```markdown
# Merge risk

## Policy
- Auto-merge: <off | on>
- Max risk to merge: <2>
- Base branch: <main>
- Merge method: <squash | merge | rebase>
- Required human approvals: <1>
- Hold labels: <do-not-merge, hold>
- Label to add on HOLD: <needs-human-merge | none>

## Path floors
| Paths | Minimum rating |
|---|---|
| <db/migrate/**> | <4> |
| <app/fiscal/**> | <4> |
| <infra/**, .github/workflows/**> | <4> |

## Notes
<anything the rating should know: what deploys automatically after a merge, which flags exist, how rollback works>
```
