# Cycle log format

Load this when starting or appending to the cycle log. One file per cycle; append, never rewrite earlier rounds.

```markdown
# Quality cycle: <branch>

- Base: <base> @ <sha>
- Started: <YYYY-MM-DD>   Max rounds: <3>
- Scope: <n commits, n files; capabilities touched>
- Scenarios: <folder or tags>
- Roles: Reviewer <delegated | self>, QA <delegated | self>

## Round 1

Head: <sha>

### Reviewer: <APPROVED | CHANGES REQUIRED>
Checks: <commands and results>

| ID | Severity | Finding | Triage | Fix |
| --- | --- | --- | --- | --- |
| R1 | high | path:line - failure mode | fix | <commit sha> (+ sibling: path) |

### QA: <APPROVED | CHANGES REQUIRED>
Report: <path>

| ID | Severity | Scenario @viewport | Finding | Triage | Fix |
| --- | --- | --- | --- | --- | --- |
| Q1 | blocker | team/invite-teammate › Member cannot invite @desktop | invite action visible | fix | <commit sha> |
| Q2 | low | settings/profile @mobile | 4px misalignment, pre-existing | follow-up | - |

### Decisions asked
- <question> -> <user's answer>

## Round 2
...

## Result

- Status: <approved in round n | escalated after round n: reason>
- Follow-ups: <ticket links or list>
- Pushed: <sha | no>   PR: <url | none>
```
