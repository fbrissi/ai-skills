# QA end-to-end profile

Copy this template to `docs/ai/qa-e2e.md` in your repository and fill it in.

```markdown
# QA end to end

## Environments
- Local base URL: <http://localhost:3000>
- Other apps on the stack: <admin URL, API URL, ...>
- Allowed staging or preview hosts: <host names, or none>   # production is never allowed
- Start the stack: <command>
- Check the stack is up: <command or URL>
- Reset or seed test data: <command>                        # test environment only

## Scenarios
- Folder: <docs/bdd/>                                       # defaults to the bdd-scenarios profile folder
- Default scope when nothing is given: <@smoke>

## Test accounts
- Source: <seed or fixture file paths>                      # never write passwords here
- Accounts by role: <owner -> seed "owner", member -> seed "member", ...>

## E-mail
- Mail catcher: <name and URL, e.g. a local SMTP catcher web UI>
- How to find a message: <search by recipient, clear inbox command>

## External test modes
- Payments: <provider test mode; where the test keys are configured; test card source>
- CAPTCHA or bot checks: <test keys configured locally, or "disabled locally">
- Other sandboxes: <storage emulator, SMS sandbox, ...>

## Viewports
- Desktop: <1440x900>
- Mobile: <375x812>

## Report
- Folder: <docs/qa/reports/>
- Commit reports: <yes | no>

## Known noise
- <console messages or requests to ignore, with the reason>
```
