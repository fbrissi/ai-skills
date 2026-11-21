# Feature file format

Load this when writing or updating `.feature` files and the coverage README.

## Layout

```text
<features folder>/
├── README.md                     # inventory, coverage matrix, unmapped list
├── <area>/<capability>.feature   # one capability per file
└── ...
```

`<area>` groups capabilities the way the app's navigation does (for example `account`, `billing`, `admin`). Use kebab-case for folders and files.

## Tags

| Tag | Meaning |
| --- | --- |
| `@p1` `@p2` `@p3` | Priority: `@p1` blocks release when it fails, `@p3` is nice to have. Exactly one per scenario. |
| `@smoke` | Minimal set that proves the capability works. One or two per feature. |
| `@role-<name>` | Role the scenario signs in as (`@role-admin`, `@role-member`, `@anonymous`). |
| `@negative` | Validation failure, denied permission, or rejected input. |
| `@permission` | Authorization boundary: denied role, other tenant, anonymous. |
| `@desktop` `@mobile` | Must also be checked at that viewport (layout-sensitive screens). No tag means the default desktop run. |
| `@email` | Needs the mail catcher. |
| `@external-<name>` | Needs a sandbox or test mode (`@external-payments`). |
| `@slow` | Waits on a background job or a timer. |
| `@wip` | Not yet executable; say why in a comment. |

Tags on the `Feature` line apply to every scenario in the file. Add the profile's custom tags when it defines them.

## Step style

- First person, present tense, business language: `When I invite "member@example.test" as a member`.
- `Given` sets state, `When` is the single action under test, `Then` checks what the user can observe (text, page, e-mail, downloaded file, status).
- Quote concrete test values. Use `.test` or `example.com` style addresses, never real people.
- No selectors, CSS classes, HTTP verbs, endpoints, SQL, component names, or wait times.
- Reference test accounts by role or by the seed name the profile gives (`Given I am signed in as the seeded "owner" user`), never by password.

## Example

```gherkin
@area-team @p1
Feature: Invite a teammate
  As a workspace owner
  I want to invite people by e-mail
  So that they can join my workspace

  Background:
    Given I am signed in as the seeded "owner" user
    And I am on the team members page

  @smoke @role-owner @email
  Scenario: Owner invites a new member and the invitee accepts
    # Data: no pending invitation for "new.member@example.test"
    When I invite "new.member@example.test" as a member
    Then I see "new.member@example.test" listed as pending
    And "new.member@example.test" receives an invitation e-mail
    When the invitee follows the link in the invitation e-mail and creates a password
    Then the invitee sees the workspace dashboard

  @negative @role-owner
  Scenario Outline: Owner cannot send an invalid invitation
    When I invite "<email>" as a member
    Then I see the error "<message>"

    Examples:
      | email                   | message                    |
      | not-an-email            | Enter a valid e-mail       |
      | existing@example.test   | Already a member           |

  @permission @negative @role-member
  Scenario: Member cannot invite people
    Given I am signed in as the seeded "member" user
    When I open the team members page
    Then I do not see the invite action

  @mobile @role-owner
  Scenario: Members list is usable on a phone
    Given I use a mobile viewport
    When I open the team members page
    Then I can read each member's e-mail and role without scrolling sideways
```

## README templates

```markdown
# BDD scenarios

Scope: <whole app | branch vs base | features>. Generated: <date>.

## Inventory

| Capability | Entry point | Roles allowed | Roles denied | Side effects | Evidence |
| --- | --- | --- | --- | --- | --- |
| Invite a teammate | /team | owner, admin | member, anonymous | invitation e-mail | src/routes/team.ts |

## Coverage matrix

| Feature | Scenario | Tags | owner | admin | member | anonymous |
| --- | --- | --- | --- | --- | --- | --- |
| team/invite-teammate | Owner invites a new member and the invitee accepts | @p1 @smoke @email | allow | | | |
| team/invite-teammate | Member cannot invite people | @p1 @permission | | | deny | |

## Unmapped / needs owner input

| Capability or rule | Question | Likely owner |
| --- | --- | --- |
| Invitation expiry | How long is an invitation link valid? Not found in code or docs. | product |
```
