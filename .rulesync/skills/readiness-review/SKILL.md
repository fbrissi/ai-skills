---
name: readiness-review
description: >-
  Decide whether each refined issue of a GitHub milestone (or one issue) is
  ready to implement, and move it to ready, back to business refinement, or
  back to technical refinement with a short reason. Changes only status. Use
  when the user or a workflow asks for a readiness review, definition of
  ready check, or to approve refined issues for implementation.
---

# Readiness review

An independent gate between refinement and implementation. Judge the issue as written; never edit its body, title, or milestone.

## Inputs

Resolve every value with [references/delivery-profile.md](references/delivery-profile.md). This skill reads `milestone` or `issue` (one is required), `output-language`, `status-labels`, `project`, `project-status-field`, `project-status-options`, `context`, `requested-by`, and `profile`.

Stop with `Unable to review: missing milestone or issue` if neither is given.

## 1. Load

Load the target with comments following [references/tickets.md](references/tickets.md). In scope: issues in `needs-review`. For a milestone, also load the other issues to check dependencies and overlaps.

## 2. Check each issue

| Check | Fails to |
| --- | --- |
| User story, acceptance criteria, and out of scope are present, specific, and testable | `needs-business-refinement` |
| No open business question in the body or comments | `needs-business-refinement` |
| `## Technical plan` covers approach, areas, tests, and validation, and matches the code (spot-check the areas it names) | `needs-technical-refinement` |
| Every acceptance criterion is covered by the plan and its validation | `needs-technical-refinement` |
| Dependencies point to issues that exist in the milestone, with no cycle | `needs-technical-refinement` |
| Its areas do not overlap an issue it does not depend on (parallel safety) | `needs-technical-refinement` |
| The size fits one PR; otherwise it should be split | `needs-technical-refinement` |
| Every triage field the profile's `## Triage` section defines is set (category label, Priority, Size, Estimate, Effort, Start and Target date, as configured; see [references/triage.md](references/triage.md)), the Estimate matches the Size scale, and the Target date is not before the Start date or a dependency's Target date | `needs-technical-refinement` |

When a business and a technical check both fail, send it to business refinement first. Do not fail an issue for style or wording that does not change what gets built.

## 3. Record

For each issue, with [references/work-status.md](references/work-status.md), set `ready` or the state from the first failing check, and comment in `output-language`:

```md
Readiness: <ready | back to business refinement | back to technical refinement>
<one to three lines: what is missing or wrong, and what would make it ready>
```

Never edit the issue body or anything else beyond its status. Every issue in scope ends the run with exactly one of `ready`, `needs-business-refinement`, or `needs-technical-refinement`, so a workflow can decide the next step from the labels alone; this step never blocks.

## Output

```text
Readiness review: <milestone | #issue>
| Issue | Decision | Reason |
|---|---|---|
Ready: <n>   Back to business: <n>   Back to technical: <n>
Blocked: none
```
