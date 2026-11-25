---
name: todo
description: >-
  Work through a markdown todo/checklist file one item at a time: plan, get
  approval, implement, validate, commit, tick the box, repeat. Use when the user
  asks to work through, burn down, or execute a TODO file or checklist.
---
# Todo

## Inputs

- **File**: a path to a markdown checklist. Default: `TODO.md` at the repo root.
- **Approval**: `per-item` (default) asks before implementing each item; `once` asks once for the whole batch of plans; `auto` asks never. Use `auto` only when the user explicitly says not to ask. In a non-interactive run (CI, or a caller that says so) a mode other than `auto` never waits: stop before implementing, with the plans in the output, as [references/non-interactive.md](references/non-interactive.md) says.
- **Limit**: optional maximum number of items for this run.
- **Guidance**: any remaining text sets constraints and validation expectations.

## Loop

1. **Pick**: take the first unchecked item (`- [ ]`). Keep its parent heading and sub-bullets as context. If none remain, finish.
2. **Plan**: inspect the relevant code and write a short plan (files, approach, validation). If the item is too vague to plan, ask, or mark it blocked and move on if the user prefers.
3. **Approve**: show the plan and wait for approval (per the approval mode). Apply revisions. Do not edit anything until it is approved.
4. **Implement**: make the smallest complete change. If the scope grows materially beyond the approved plan, pause and re-plan.
5. **Validate**: run the relevant checks. If they fail, stop without ticking the box.
6. **Tick**: change that item to `- [x]`, leaving every other line untouched.
7. **Commit**: commit this item's changes plus the tick (explicit paths) following `references/commits.md`.
8. Go back to step 1.

Stop immediately when approval is declined, validation fails, or a commit fails. Report which item it stopped on.

## Output

```text
Todo: <file>
Done this run: <n>  Remaining: <n>
- [x] <item> - <sha>
Stopped: <reason, if any>
```
