# Quality cycle profile

Copy this template to `docs/ai/quality-cycle.md` in your repository and fill it in. Review and QA settings stay in the `review-changes`, `qa-e2e`, and `bdd-scenarios` profiles.

```markdown
# Quality cycle

## Loop
- Max rounds: <3>
- Base branch: <main>
- Cycle log folder: <docs/qa/cycles/>
- Commit cycle logs and QA reports: <yes | no>

## Checks
- Full checks before push: <commands: tests, lint, typecheck, build>
- Narrow checks per area: <how to run tests for one area>

## Triage
- Fix in cycle: <blocker, critical, high, medium; cheap lows in touched code>
- Follow-up tracker: <GitHub issues | other; label to apply>

## Shipping
- After approval: <ask | push | push and open a PR>
- PR skill: <pr-create | ship | none>
```
