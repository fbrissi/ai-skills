---
name: technical-refinement
description: >-
  Write a repo-grounded technical plan on each issue of a GitHub milestone (or
  one issue) and make sure the milestone's issues can be built in parallel
  without conflicts: disjoint areas or explicit dependencies, splitting or
  merging issues when needed. Use when the user or a workflow asks for
  technical refinement, to plan a milestone's issues, or to prepare issues
  for parallel implementation.
---

# Technical refinement

Plan only. Do not edit source files, create branches, or change the business sections of an issue.

## Inputs

Resolve every value with [references/delivery-profile.md](references/delivery-profile.md). This skill reads `milestone` or `issue` (one is required, on GitHub), `base-branch`, `output-language`, `status-labels`, `project`, `project-status-field`, `project-status-options`, `research-sources`, `context`, `requested-by`, and `profile`.

Stop with `Unable to refine: missing milestone or issue` if neither is given.

## 1. Load

1. Load the target with comments and attachments following [references/tickets.md](references/tickets.md): for a milestone, every issue in it (`gh issue list --milestone "<title>" --state all --json number,title,labels,body,state`), so plans already written count in the conflict pass. Download and read the tracker attachments an issue lists under `## Attachments` when the access exists, as `tickets.md` says.
2. In scope: issues in `needs-technical-refinement`, and issues in `technical-blocked` whose questions were answered since. Leave the others as they are.
3. Read the repository's guidance (`AGENTS.md`, `CLAUDE.md`, project docs, the profile's Code map and Context) once for the whole run.

## 2. Plan each issue

Follow the `ticket-plan` skill for each issue in scope, without sync and without asking (record assumptions instead). If it is not installed: read the issue and its comments, inspect the code, schema, config, and tests it touches, and confirm current behavior instead of trusting the issue text.

Each plan states, in `output-language`:

```md
## Technical plan
- Approach: <how, in a few lines>
- Areas: <files, modules, migrations, endpoints, UI routes it changes>
- Technical choices: <libraries, patterns, data changes, and why>
- Tests: <tests to add or update>
- Validation: <commands and observable checks>
- Depends on #<n>: <why> (omit when none)
- Assumptions / Risks: <only if they matter>
```

When a question blocks a reliable plan (a missing contract, an unknown external system, a choice with product impact), do not guess: it goes to step 4 as blocked. Consult `research-sources` before deciding something is unknown.

## 3. Cross-issue pass (milestone)

Issues in a milestone are implemented in parallel, each on its own branch from the milestone branch. Make that safe:

1. List each issue's Areas side by side, including issues already planned, ready, or in progress.
2. For every pair that touches the same file, migration sequence, shared contract, or generated artifact:
   - Make them disjoint by moving the shared change into the issue that owns it, or
   - Add `Depends on #<n>` to the later one so it starts only after the other is done, or
   - Split an issue whose parts have different dependencies, or merge two issues that cannot be separated. Splits and merges keep the business sections and acceptance criteria intact across the result, keep every resulting issue in the milestone, link the originals, and close a merged-away issue with a comment pointing to the survivor.
   - Business refinement already shaped the issues by deliverable. Split or merge here only for code reasons (areas, dependencies, size), say the code reason in the linking comment, and never undo a business split or merge for a reason that is not technical.
3. Reject dependency cycles: reorder or merge until the graph is acyclic.
4. Never edit an issue that is already `in-progress` or later. If it conflicts, add the dependency to the other issue instead.

## 4. Revise triage

With [references/triage.md](references/triage.md) and the profile's `## Triage` section, revise each planned issue's Size, Estimate, and Effort from its technical plan and similar past work. Split an issue above the largest size (step 3's split rules; each part gets its own triage). When dependencies move an issue's Start date or Target date, update them. Set any required triage field that is still empty, including on issues created by a split. Values a person set change only when this refinement changed the scope, with a comment, as `triage.md` says.

## 5. Write and set status

Write the plan into the issue body as the `## Technical plan` section, after the business sections, replacing that section on a re-run (body through a temp file). Then, with [references/work-status.md](references/work-status.md):

- Planned without open questions: `needs-review`.
- Blocked: comment the questions on the issue (what is missing, why it blocks, options when known) in the stop-point format of `references/delivery-profile.md` with stage `technical-refinement`, and set `technical-blocked`.
- The business content is wrong or contradicts the code in a way only the requester can settle: comment why and set `needs-business-refinement`.

## Output

```text
Technical refinement: <milestone | #issue>
| Issue | Areas | Depends on | Size / Estimate / Effort | Dates | Status | Note |
|---|---|---|---|---|---|---|
Triage fields skipped: <field: reason, or none>
Conflicts resolved: <pair: how>
Splits / merges: <what changed, or none>
Questions: <issue: question, or none>
Blocked:
- #<issue> technical-blocked: <summary> | questions: <comment URL>
```
