# BDD scenarios profile

Copy this template to `docs/ai/bdd-scenarios.md` in your repository and fill it in.

```markdown
# BDD scenarios

## Output
- Features folder: <docs/bdd/ | tests/bdd/features/>
- Step language: <English>                       # tags and file names stay English
- Gherkin check: <command that parses or dry-runs the features, or none>

## Sources
- Product and architecture docs: <paths>
- User-facing routes: <router files or folders>
- API routes and authorization: <paths>
- Existing end-to-end tests: <paths>

## Roles
| Role | Tag | Can | Cannot |
| --- | --- | --- | --- |
| <owner> | @role-owner | <...> | <...> |
| <anonymous> | @anonymous | <public pages> | <everything else> |
- Tenancy: <workspace, account, organization, or none>

## Test data
- Seed or fixture files: <paths>                 # where test accounts and records come from
- Seeded accounts referenced by name: <owner, member, ...>
- Never use: <real accounts, production exports>

## External dependencies
- Mail catcher: <name and URL, or none>
- Sandboxes and test modes: <payments test mode, storage emulator, ...>
- Out of scope for scenarios: <flows that cannot run locally, and why>

## Viewports
- Mobile-sensitive areas: <screens that need @mobile>

## Custom tags
- <@tag>: <meaning>
```
