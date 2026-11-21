---
name: bdd-scenarios
description: >-
  Map an application's features from its routes, views, API, docs, and tests,
  and write executable BDD feature files (Gherkin) with roles, tags, data setup,
  a coverage matrix, and a list of gaps that need owner input. Use when the user
  asks to write BDD or Gherkin scenarios, feature files, acceptance scenarios,
  or a test plan for QA, for a change or the whole app.
---
# BDD scenarios

Write scenarios a QA agent can execute in a real browser against a local or test stack, with test data only. Describe behavior in business language; never describe implementation.

## Inputs

- **Scope**: `whole app`, a base branch or diff (`main`, `uncommitted`), a PR, or named features. Default: the current branch against its base when it has commits, otherwise the whole app.
- **Profile**: default `docs/ai/bdd-scenarios.md`, or a path given in the request.
- **Focus**: any remaining text narrows features, roles, or priorities.

## Profile

Read the profile first; [references/profile-template.md](references/profile-template.md) lists its fields (features folder, app entry points, roles and permissions, test data sources, mail catcher, external sandboxes, viewport tags, language of the steps). Without a profile, ask only for what you cannot infer (where the features go, which roles exist), default the folder to `docs/bdd/`, and offer to save the answers as a profile.

Write steps in the profile's step language (default English). Keep tags and file names in English kebab-case.

## 1. Inventory

Build the feature inventory from evidence, not guesses. Read, in order of trust:

1. Product and architecture docs, and the nearest `AGENTS.md`/`CLAUDE.md`.
2. User-facing routes and views (router config, pages, navigation menus).
3. API routes and their authorization rules (roles, permissions, tenant scope).
4. Existing tests (end-to-end, integration) and existing `.feature` files.
5. Outbound side effects: e-mails sent, files generated, payments, webhooks, jobs.

For a diff scope, list the changed capabilities first, then the capabilities that share their code paths (regression candidates). Do not inventory the whole app for a small diff.

Record each capability as: name, entry point (URL or action), roles allowed and denied, side effects, external dependencies, and the evidence path. Anything you cannot confirm from the repo goes to **Unmapped / needs owner input**, never into a scenario as an assumption.

## 2. Plan scenarios per capability

For each capability, cover:

- **Happy path**: the main success outcome, for each role that is allowed.
- **Validation**: required fields, invalid formats, limits, duplicates.
- **Permissions**: each denied role, an anonymous visitor, and a user from another tenant or account when the app has tenancy.
- **States**: empty, loading or pending, error, and recovery (retry, back, refresh on a detail URL).
- **E-mail flows** (when the app sends e-mail): the e-mail arrives, its subject and key content are right, and following its link completes the flow; an expired or reused link is rejected.
- **External dependencies**: only through sandboxes or test modes named in the profile.

Mark one or two scenarios per capability as `@smoke`. Use Scenario Outline with Examples when only data changes.

## 3. Write the feature files

Follow [references/feature-format.md](references/feature-format.md) for file layout, tags, step style, and an example. Rules:

- One `.feature` file per capability, named `<area>/<capability>.feature` under the profile folder.
- `Background` holds only shared preconditions (signed in as a role, a seeded record). It must not hide the behavior under test.
- One behavior per scenario: one `When` block, observable `Then` outcomes.
- Steps describe what a user does and sees ("I submit the invitation form"), never selectors, endpoints, SQL, or component names.
- Every scenario is runnable on a local stack with test data. Credentials come from the project's seed or fixture files or a profile reference to them; never write real credentials, tokens, or personal data into a feature file.
- Put data setup in a `# Data:` comment under the scenario title when it needs more than the Background (which seed, which record state).
- Never schedule a real payment, a production write, or an irreversible external effect. If a capability can only be exercised that way, list it as unmapped with the reason.

Update existing feature files in place instead of duplicating them. Keep scenario titles stable, because QA reports and cycle logs reference them.

## 4. Coverage matrix and gaps

Write `<features folder>/README.md` (or update it) with:

1. The feature inventory table (capability, entry point, roles, side effects, evidence).
2. The coverage matrix: one row per scenario, with feature, scenario title, tags, and one column per role (`allow`, `deny`, or blank).
3. **Unmapped / needs owner input**: capabilities or rules you could not confirm, with the question to ask and who likely knows.

Use the templates in [references/feature-format.md](references/feature-format.md).

## 5. Validate

- Every `.feature` file parses as Gherkin (run the project's Gherkin linter or runner in dry-run mode if one exists; otherwise check keywords, indentation, and that every Outline has Examples).
- Every scenario has a priority tag and the roles it needs.
- Every capability in the inventory has at least one scenario or an unmapped entry.

## Output

```text
BDD scenarios: <scope>
Folder: <path>
Features: <n> files (<new> new, <updated> updated)
Scenarios: <n> (<smoke> @smoke, <neg> negative or permission)
Roles covered: <list>
Unmapped / needs owner input: <n>
1. <capability> - <question>
Next: run them with the qa-e2e skill (or execute the scenarios manually in a browser)
```
