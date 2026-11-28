# Changelog

All notable changes to this project are documented here. Release versions follow
[Semantic Versioning](https://semver.org/).

## v0.16.0

### Added

- Azure AI Speech as a second TTS engine in `video-shorts`. The optional profile setting `video.tts` (`engine`: `piper` or `azure`, `voices`, `rotation`) picks the engine and the allowed voices; without it narration is Piper with `video.voice`, as before, and Piper stays the default. `voice.mjs` calls the Speech REST API with `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` (the key never appears in logs or errors), applies the same silence trim, EQ, and −16 LUFS loudness as Piper, and re-synthesizes a line when the engine or voice changes.
- Voice alternation. With several voices and `rotation: "alternate"`, `plan-slots.mjs --previous <manifest>` assigns a `voice` to the video items in publish order, starting from a voice the previous batch's last narrated item did not use; `voice.mjs` refuses a spec without a voice, or with one outside `video.tts.voices`. Manifest items record `voice` and `ai_audio_engine`.

### Changed

- The AI narration disclosure names the engine: "Narração com voz sintética (Azure AI Speech)." for Azure, "(Piper TTS)" as before for Piper. `credits.mjs` adds no voice line for Azure prebuilt voices unless the profile sets `video.voice_credits.<voice>`, and prints nothing when there is no credit at all; Piper voices still need their credit.

## v0.15.0

### Added

- Separate quality mode for the `task-implementer` agent. When the caller runs the code review and QA in their own workflows (`quality-mode: separate` of `fbrissi/github-actions` `ai-task.yml` v1.20.0), the agent only develops: it runs the narrow checks of the change, pushes, opens the pull request, and stops, and the review and QA findings come back to a PR fix pass. The default `cycle` mode keeps the quality cycle in the run.
- Size for one implement run. `triage.md` sizes each issue for one implement run (the content to write, the areas, and the scenarios count, not only the code), and the delivery profile gains `Largest size per issue` (default `S`). `business-refinement` makes deliverables as small as they can be while each stays acceptable on its own, and `technical-refinement` splits an issue above that size unless it cannot be split, and says why. A content-heavy issue sized S had run out of time in one implement run.

### Changed

- This repository's pull requests run the full AI loop with review and QA in separate jobs (`fbrissi/github-actions` v1.20.0): Quality Checks dispatches Code Review and the new QA workflow (`qa.yml`, the `AI QA` check) in parallel; `code-review.yml`, QA, and the new `pr-feedback.yml` join both verdicts and dispatch the new PR Fix (`pr-fix.yml`, `hotfix/` and `bugfix/` branches or the `ai:auto-fix` label) or Merge Decision (`merge-decision.yml`, rates the risk and holds; a person merges). The weekly AI dependency update only develops and opens its pull requests (`quality-mode: separate`, ai-skills v0.15.0) and the loop follows up.

## v0.14.1

### Fixed

- An unmet acceptance criterion is never a follow-up. `review-changes` judges each acceptance criterion of the referenced ticket, and one the diff does not meet, or meets only in part, is at least a `medium` finding that quotes it. `quality-cycle` fixes such a finding in the cycle whatever severity a role gave it, and the `task-implementer` agent never lists a criterion under follow-ups: only a person can drop or defer one. A run had reported a hardcoded number that broke a "single source" criterion as a follow-up.
- A scenario counts only when it can run. A scenario the change adds or changes with a tag the project's E2E config always excludes (for example `@email` inherited from the `Feature:` line) is a `medium` finding in `qa-e2e` and a fix in `quality-cycle`, unless it needs the tag and carries the owner decision the project requires. A scenario QA could not run because of the environment is `blocked` with its exact cause as an environment finding: `quality-cycle` fixes it when the cause is in the repository and otherwise reports it as open, never as covered by other tests.
- The `task-implementer` agent labels a pull request that needs a person's sign-off (for example legal text) `ai:needs-approval` at creation, in every state that opens a PR, instead of only `ai:needs-human`. A criterion only a person can satisfy (a sign-off) is not a review finding, so it never blocks the cycle. The escalation label stopped the PR fix passes, so a review finding waited for the person too. With `fbrissi/github-actions` `v1.19.0`, the approval label keeps the fix passes running and only the merge waits for the person's approval of the final head.

### Changed

- Split issues keep their background as GitHub sub-issues. `business-refinement` and `technical-refinement` add each issue split from another as its sub-issue, keeping the text links. `references/tickets.md` gains "Parent and sub-issues (GitHub)": every skill that works from an issue loads its parent as context (why, for whom, research, decisions) and its sub-issues as scope already split out, while the issue's own body and acceptance criteria stay the contract.

## v0.14.0

### Added

- `social-content-plan` gains a creative method (`references/creative-method.md`): before any copy, each item gets a creative brief (who and when, the insight in the audience's words, a single-minded message, the pillar, the angle, a concrete scene, the proof from the allowed claims, the call to action), then the copy is written from it and the batch is read side by side so no two items share a skeleton, opening, or closing. It uses the `copywriting` and `social` skills when installed. The `facebook-content`, `instagram-content`, `youtube-content`, and `linkedin-content` agents write from the creative brief.
- The shared social profile template gains a `## Brand` section: positioning, personality, audience pains in their words, messaging pillars, good and bad copy examples, and visual direction.
- `copy-guard` warns (`repeated-template`) when the same sentence of four words or more, or the same three-word opening, appears in the text of three or more items of a batch, and its review patterns cover shared skeletons, product-description sentences, and off-brand copy.
- `image-cards` supports `image_focus` (`{x, y, w, h}`) to show only a region of a screenshot, drawn at the region's size so its UI text stays legible.
- `video-shorts` gains `frames.mjs`, which extracts the first settled and last frame of every screen and footage scene, full and cropped to the screen window, to inspect the frame edges.
- `social-review` prints the text drawn in an item's media (each card's kicker, headline, lead, and badge; each video scene's title, headline, body, and narration) from its spec in the review issue, so stories and carousel slides can be reviewed; a story with no caption no longer shows an empty text block.

### Changed

- `image-cards`: a card without an image (statements, stories, carousel covers) is centered vertically with larger type instead of leaving the bottom of the card blank. The render warns when one blank stretch takes more than 35% of the safe area's height, and when a screenshot is drawn below 60% of its source width (UI text unreadable on a phone).
- `video-shorts`: `render.mjs` scans the screenshot along every frame edge inside the image (start and end views) and refuses a `focus` or `pan_to` box whose edge slices text or a control, naming the edge and the range it cuts (`--allow-cut-edges` skips the scan). The skill prefers screenshots cropped to the useful area at capture time, and boxes that span the full width or keep a margin from content, and requires looking at every scene's frame edges.

## v0.13.2

### Fixed

- Non-interactive runs no longer end while delegated work is still running. In print mode a run ends with the agent's turn and stops what is still running, so an `issue-resolver` that handed the fix to a `developer` running in the background and ended its turn to wait lost the work and reported success. The `dev` skill's `references/non-interactive.md` (shared with the skills that list it) gains "Finish before you stop": wait for delegated roles and long commands, never end the turn to wait for one, and end only with the skill's outcome. The delegating agents (`issue-resolver`, `task-implementer`, `milestone-delivery`, `delivery-orchestrator`, `dependency-updater`, `nfse-compliance`, `pr-shepherd`) wait for every delegated role before acting on it or ending the turn, and `quality-cycle` waits for both verdicts when Reviewer and QA run in parallel.

## v0.13.1

### Fixed

- `copy-guard`: numbers in digits (counts, percentages, amounts, durations) must appear in the profile's Offer, Allowed claims, or Calendar hooks with the same word next to them, or in the new `copy_guard.allowed_numbers`; others are `unsourced-number` errors (warnings without `--profile`). Dates, years, times, prices, links, hashtags, credits, and legal or version ids are not claims. A carousel slide with an invented "30 recorrências" now fails.
- `copy-guard`: the manifest check also reads the text drawn in each item's media (the cards or video spec in `spec`), where slide and Story text lives.
- `copy-guard` and the `instagram-content` and `linkedin-content` agents: relative days ("hoje", "amanhã", "nesta sexta", "esta semana", "today", "tomorrow") are `relative-day` errors in items a cron publishes (Stories, Instagram, LinkedIn, anything not scheduled by the platform), whose run day is not guaranteed; text mode takes `--cron` or `--platform instagram|linkedin`.
- `video-shorts`: the profile's new optional `video.screen_disclaimer` is drawn under every product screen (screenshots and real recordings); when it is set, the render stops when a product screen lacks it or it does not fit one line. Profiles without it keep rendering, with a warning that names the bare product screens. `footnote` falls back to the profile's `video.footnote`.
- `video-shorts`: `render.mjs` refuses `focus` and `pan_to` boxes the 1000x720 screen frame cannot show whole (a wide screenshot without a box cut its sidebar labels), boxes past the image, and footage not cropped to the frame aspect; `video-spec.md` documents how to draw boxes that keep UI text whole.
- `social-review`: the issue body shows each item's link, how it is sent (a Facebook or LinkedIn `post` sends it as the link preview, outside the text), and its UTM parameters.

## v0.13.0

### Added

- LinkedIn: the `linkedin-content` agent (generate and adjust, like the other social agents) and the deterministic `linkedin-publish` skill. It posts as a company Page with the Community Management API: text and link posts, single images, multi-image posts, and videos uploaded through the Images and Videos APIs. A cron publishes one due item per run. A read-back of the Page's posts resolves lost responses without posting twice, a call budget enforced on every request (media polling included) keeps within the Development tier's 500 calls per day, a failed item stops blocking the queue after 3 attempts, and a plain-text AI disclosure is added when narration or footage is synthetic. Env: `LINKEDIN_ORGANIZATION_ID`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REFRESH_TOKEN`.
- Manifest: `linkedin` platform, item fields `ai_audio` (TTS narration) and `music` (track with `license_url`, Drive `evidence`, `sha256`), options `paid_product_placement` (YouTube) and `ai_disclosure` (LinkedIn). `image-cards` formats `li-landscape` (1200x627) and `li-square` (1200x1200).

### Changed

- Meta AI label: Facebook Reels and Instagram containers send `is_ai_generated=true` when an item has `ai_audio` or `synthetic_media` (Instagram carousels: parent only). `video-shorts` reports `ai_audio` whenever narration was generated. YouTube's `containsSyntheticMedia` stays tied to realistic AI visuals.
- YouTube uploads always declare `paidProductPlacementDetails.hasPaidProductPlacement` (default false), since an omitted field now means "not declared". A thumbnail that fails before processing finishes is retried on later runs (`state.<id>.extra.pending_thumbnail`, at most 5 attempts) instead of being dropped.
- Music license evidence: every track in `video.music.tracks` needs `license_url`, `evidence` and `sha256`; `video-shorts` refuses music without them or whose file hash differs, and the review issue links the evidence. YouTube Shorts with music must be at most 60 s. Facebook Reels record their copyright check in `state.<id>.extra`.
- Instagram allows at most 5 hashtags; `copy-guard` takes a per-platform `max_hashtags` map and never allows Instagram more than 5. Instagram image posts send `alt_text` from `media.alt`.
- Facebook Reels schedule at most 29 days ahead (feed posts stay at 30).
- `copy-guard` flags pt-BR fear, urgency, and official-endorsement claims ("evite multa", "podem ser multadas", "prazo final chegando", "última chance", "não perca o prazo", "aprovado pela Receita", "conformidade garantida"), and warns on "todas as empresas são obrigadas" (not "nem todas…"), which needs the official source. Neutral fiscal wording ("o prazo final para entrega é…", "nos últimos dias") passes.
- Docs: Google OAuth "Testing" refresh tokens expire after 7 days (`invalid_grant`); Meta apps need Live mode, App Review, Page Publishing Authorization for Instagram, and a system-user Page token; YouTube asks only for `youtube.upload` unless playlists or captions are used; Instagram API Stories have no link sticker.

## v0.12.0

### Added

- Social content flow ([docs/social-content.md](docs/social-content.md)): agents generate organic content for Facebook, Instagram, and YouTube from the project's context, a person reviews it on a GitHub issue, and deterministic publishers post it only after approval.
- Agents `facebook-content`, `instagram-content`, and `youtube-content`, each with a `generate` mode (plan, copy, media, copy guard, manifest, Drive upload, review issue) and an `adjust <issue>` mode (redo only what `/adjust` comments from writers ask for). Headless; they never publish.
- Skills `social-content-plan` (dated slots from the profile's days, times, time zone, blackout dates, and calendar hooks; sourced briefs; skeleton manifest), `copy-guard` (mandatory checker and detect-only review for AI writing tells, engagement bait, unsupported social proof, and fiscal or savings promises, pt-BR and English, extendable per project), `image-cards` (HTML/CSS cards rendered with Playwright in Docker without network: Instagram 4:5, square, and Stories, Facebook 1080x1350 and 1200x630, YouTube thumbnails), `video-shorts` (9:16 Shorts and Reels with Remotion, Piper narration at −16 LUFS, music from a Drive folder, voice and music credits), and `social-review` (Drive upload with the `drive.file` scope under `<root>/<Platform>/<date>/`, review issue with a hidden manifest marker, `/adjust` revisions).
- Deterministic publishers `facebook-publish` (Graph API posts, photos, multi-photo posts, and scheduled Reels), `instagram-publish` (one due item per cron run, media in a public S3-compatible bucket, two-step container publishing, 24-hour limit), and `youtube-publish` (resumable uploads scheduled with `publishAt`, synthetic media disclosure, thumbnail, playlist, captions, daily limit). All keep idempotent state in the manifest and never print tokens.
- Approval is a deterministic step, `review-batch.mjs approve`: only a writer's `/aprove` comment newer than the last revision, on an issue whose body is at that revision, approves the batch, and publishers refuse an approval for another revision. A final publish call without a response leaves the item `unknown` and is never retried blindly (Instagram resolves it from its container), so nothing is published twice.
- One platform-neutral batch manifest with a JSON Schema and a validator (`social-manifest.mjs`), shared by every social skill; one consumer profile, `docs/ai/social-content.md`.
- Unit tests for every social script in `tests/social/` (`node --test`), run by CI.

## v0.11.0

### Changed

- Every stage that works from an issue opens its images itself: `business-refinement`, `technical-refinement`, `readiness-review`, `delivery-orchestration` (when it reads issues), `dev` and the `task-implementer` agent, `quality-cycle` (each role gets the ticket reference), `qa-e2e`, `review-changes`, and `pr-fix` (when feedback points at an image) download and open every image attachment and inline image, from the tracker, the issue's `## Attachments`, and private GitHub `user-attachments` (downloaded with the environment's token), instead of relying on another stage's transcription. `qa-e2e` compares the implemented UI against the original images. When an image cannot be downloaded the stage says so, and stops with a question when the image is needed to decide. The rule is in the new `Images in every stage` section of `shared/references/tickets.md`, now also copied into `quality-cycle`, `qa-e2e`, and `pr-fix`.
- `pr-fix` resolves a review thread a bot (or its own review) started once the pushed commit fixes it, and `review-changes` resolves its own earlier threads whose finding the current head fixes, so a merge gate that waits for zero open threads no longer stalls on fixed findings. Threads people started stay open for them. `pr-context.sh` now returns each thread's `threadId`.
- `delivery-orchestration` waits up to about 15 minutes for the milestone PR's required checks after the mergeable check and before marking it ready; a failing check leaves it in draft with a blocker naming the check, and checks still pending leave it in draft for the next run.
- The release version counts only release branches with an open PR into the base branch (or an open auto-release milestone), so stale `release/*` branches no longer inflate it. An abandoned auto-release milestone (no open PR, no open issue) is closed and reported.
- New delivery profile line `No-release paths` (comma-separated globs, default none): when every file the milestone changes matches them, release notes are not needed (no notes PR, no version). The repository's release-note validation must exempt the same paths.
- `business-refinement` links Jira attachments in the issue's `## Attachments` section with their browser URL (`<JIRA_BASE_URL>/secure/attachment/<id>/<filename>`), which opens the image for anyone signed in to Jira, and adds the source ticket link at the top of the section. Later steps still download attachments through the REST API by the id in the URL (`shared/references/tickets.md`). Images still do not render inline on the issue, since Jira requires sign-in, so each keeps its text description.

## v0.10.1

### Fixed

- `delivery-orchestration` checks that the milestone PR merges cleanly into the base branch before marking it ready (`gh pr view --json mergeable`). On a conflict (for example `CHANGELOG.md` when the base got a release after the milestone branch was cut) it leaves the PR in draft and stops with a blocker naming the conflicting files for a person to resolve, instead of marking a conflicting PR ready. The output reports the mergeable state.

## v0.10.0

Release order: this release first, then `fbrissi/github-actions` (its `dependency-update` prompt rule and the orchestrate-on-merge example, which must also accept `bugfix/` PRs into release branches), then wrappers that call it.

### Changed

- Bugfixes with no release branch to target open one instead of waiting or blocking (`delivery-profile.md` `Opening a release for a bugfix`, `dependency-updates`, `dependency-updater`, `issue-resolver`, `delivery-orchestration`, `docs/delivery-flow.md`). When `Bugfix release branch` is unset (not `base`) and no release branch is open, the flow computes the next version with the release notes rule (`Release version`'s increment, else the next patch), creates a milestone named after it (with `<!-- ai-delivery auto-release -->` and the `requested-by` marker), creates its release branch from the base branch with `Release branch template` exactly as orchestration names it, and puts a tracking issue in the milestone (`issue-resolver`: the resolved issue; `dependency-updates`: `Dependency updates <date>` listing the packages), `in-progress` then `in-review`. The bugfix PR into the release branch carries `Closes #<issue>` and the milestone, so `delivery-orchestration`, re-run when it merges, marks the issue done, opens the draft milestone PR, writes the release notes, and marks the milestone PR ready for a human. Only one such release is open at a time: later bugfixes target it and add their own tracking issues. When the release branch cannot be created (for example a ruleset refuses the ref), dependency updates wait for a later run and issue resolution posts a blocker, as before, saying why; a concurrent run that already created the milestone or branch is reused instead. A release whose milestone PR is ready for review takes no more bugfixes (the next one opens a new release), and its release notes use the milestone's version instead of recomputing it.
- New delivery profile key `Open release for bugfixes` (default `yes`): `no` keeps the previous behaviour. Set it where `delivery-orchestration` does not run (no orchestrate workflow, or an orchestrate-on-merge workflow that ignores `bugfix/` PRs).
- `delivery-orchestration` completing a milestone closes only the issues that are done or whose PR merged into the milestone branch; the others stay open and are reported.
- `dependency-updates` now carries copies of `delivery-profile.md` and `work-status.md`.
- `next-*` release versions compare by semantic-version precedence, ignore tags with a path prefix (`app-name/v1.2.3`), keep a pre-release form, incrementing its last numeric identifier (`v0.1.0-beta.2.2.14` -> `v0.1.0-beta.2.2.15`), and take the newest tagged `release-notes-file` section as the current version line, ignoring tags created before that tag (an earlier, restarted numbering).

## v0.9.0

Release order: this release first, then `fbrissi/github-actions` (which reads the new `merge-risk-result:` line and defaults `ai-skills-ref` to `v0.9.0`), then wrappers that call it.

### Changed

- `merge-risk` reports `NOT EVALUATED` when it cannot read what the gates and the rating need (a missing or failing CLI, an API or authentication error, a PR or diff it cannot load): it rates nothing, posts no HOLD comment or label, and says why; a merge refused for a tooling or access reason is `NOT EVALUATED` too, while one refused for the PR's state is a HOLD. Its output ends, after the merge attempt and outside the PR comment, with one machine-readable line, `merge-risk-result: merged | held | not-evaluated`, so a calling workflow can tell a real decision from a tooling failure. Before, a tooling failure was posted as a HOLD that the workflow recorded as the decision for that commit.
- Release notes (`delivery-profile.md`, `delivery-orchestration`): the release notes branch starts the notes file (and changed version files) from the base branch's copy instead of the release branch's, without merging the base branch (that would also bring `.github/workflows/**` changes the agent's token cannot push). Sections added to the base branch after the release branch was cut are kept, the new section goes at the top, and the release PR into the base branch does not conflict in that file, whether it merges with a merge commit or a squash; other base branch changes are not brought in by the notes PR. `next-patch`, `next-minor`, and `next-major` now increment the highest version already taken: the notes on the base branch, the release tags, and other open release branches, so a release never gets a version at or below an existing tag.
- Bugfix branches (`delivery-profile.md`, `dependency-updates`, `issue-resolver`, `docs/delivery-flow.md`) are created from their target release branch instead of the base branch, so a bugfix PR into `release/*` carries only the fix and is validated on the release; a reused dependency-update branch merges its target when behind.

### Fixed

- `dependency-updates` skips an update the target branch already has in its manifest and lockfile (for example from an earlier bugfix PR merged into the release while the bot PRs into the base branch stay open), so the next weekly run does not redo it.

## v0.8.1

Release order: this release first, then `fbrissi/github-actions`, whose default `ai-skills-ref` moves to `v0.8.1`.

### Fixed

- Triage dates no longer stay empty when the source ticket has no due date or deadline, which made `readiness-review` send the issue back to technical refinement again and again. `triage.md` defines no-deadline defaults (Start today or after the issues it depends on; Target the Start plus the working days the Estimate implies, or 10 working days without an Estimate), `business-refinement` uses them, and `technical-refinement` has an explicit step that fills an empty Start or Target date even when no dependency moved it. `readiness-review` stays strict.

## v0.8.0

### Added

- `dependency-updates` skill: brings a repository's open Dependabot (or Renovate) PRs, and optionally outdated packages up to a level, into a hotfix PR for security fixes and a bugfix PR into the open release branch, branched like `issue-resolver`: an update that fixes a high or critical advisory on the version in use (or that a person labeled with the hotfix label) goes to `hotfix/dependency-updates-<date>` into the base branch with a release section; the rest go to `bugfix/dependency-updates-<date>` into `Bugfix release branch`, else the oldest open release branch, with no release section, and wait for a later run (reported, no blocker) when there is none. Per package it reads the release notes and upgrade guide, lists the breaking changes that apply, adapts the affected code with `dev`, and holds back what cannot be adopted safely with a reason; then it runs the project's checks and `quality-cycle`, writes the release notes the PR's target needs, and opens each PR with `pr-create`, listing packages, breaking changes and their handling, held packages, checks, QA, and `Supersedes #<n>` for each bot PR. A later run updates the open PR of its kind (marker `<!-- ai-dependency-updates -->`) instead of opening another. It never closes or merges bot PRs. Profile `docs/ai/dependency-updates.md` (ecosystems, bots, outdated level, labels, never-update and hold lists, supply chain, extra validation); branches, labels, and the bugfix target come from the delivery profile (`Bugfix release branch: base` for repositories without release branches).
- `dependency-updates` safety: it reuses a PR only when it is a same-repository PR opened by the run's own identity on a branch with that kind's prefix, so a fork PR that copies the marker is never checked out; a taken branch name gets `-2`, `-3`; when a reused branch cannot be pushed (for example the base changed workflow files) it moves to a new branch and PR and closes its own old one. Supply-chain rules: lifecycle scripts off where the project allows, a `Minimum release age` (default 3 days, with the bot's `cooldown`), only the needed secrets, and suspicious installs held. `Never update` takes a package, an ecosystem, or a path; grouped bot PRs that keep such an update stay partly superseded. One rule for bot PRs everywhere: never close, merge, approve, comment on, or push to them.
- `dependency-updater` agent: runs `dependency-updates` with `developer`, `code-reviewer`, and `qa-tester`, opens or updates the hotfix and bugfix PRs, and stops; the PR follow-up (`pr-fix`, merge decision) takes over. A separate agent rather than an `issue-resolver` mode, because there is no issue to resolve: each run gathers many packages into at most two PRs.
- `docs/delivery-flow.md` describes the weekly dependency update path next to issue resolution.
- This repository runs the flow on itself: `.github/workflows/ai-dependency-update.yml` (Monday 15:00 UTC, after Dependabot, plus manual runs) with the profile `docs/ai/dependency-updates.md`. It is skipped while the `AGENT_APP_CLIENT_ID` variable is empty (a missing private key fails the run), installs with `npm ci --ignore-scripts`, passes only the agent App key and harness keys, sends non-urgent updates to `main` too (`Bugfix release branch: base`, no release branches here), and stops at the PRs (no PR follow-up workflows here).

### Changed

- Updated `rulesync` from 43.8.2 to 43.11.0 (supersedes Dependabot PR #11). The releases in between add targets and permission and hook fixes this repository does not use; `npm run generate` produces identical outputs.

## v0.7.0

### Added

- `delivery-orchestration` writes the release notes when every issue of a milestone is done: a new section at the top of the profile's `Release notes file` (heading from `Release heading`, version from `Release version`: the milestone name or the next patch, minor, or major version) that summarizes the merged task PRs, plus the `Version files`. Release branches take changes only through PRs, so the notes go in their own PR from `Release notes branch template` (default `feature/{release-slug}-release-notes`) into the release branch, which follows the task PR follow-up; the milestone PR is marked ready only after it merges. New `## Release notes` section in the delivery profile template; without `Release notes file` nothing changes.

### Fixed

- `delivery-orchestration` and `delivery-orchestrator` stop at a failed push, PR command, or dispatch instead of moving statuses and dispatching past it.
- `task-implementer` runs the reviewer and QA for every change, documentation included, tells QA when the caller already started the test environment, and sets the Project status field with every status label move.
- `docs/delivery-flow.md` describes the send-back limit (3 per milestone) next to the loop guard.

## v0.6.0

### Added

- Delivery flow: four skills that take a source ticket to reviewed PRs, each a separate non-interactive run. `business-refinement` turns a Jira ticket, GitHub issue, or GitHub milestone into a milestone with business-level issues, or comments the open questions on the source in its language. `technical-refinement` writes a technical plan per issue with `ticket-plan` and makes the milestone safe to build in parallel (disjoint areas or explicit dependencies, splits and merges). `readiness-review` moves each issue to ready or back to refinement with a reason. `delivery-orchestration` creates the milestone and task branches, starts unblocked issues up to `max-parallel` (dispatching the implement workflow in CI), and opens the milestone PR when every issue is done. See `docs/delivery-flow.md`.
- Delivery agents: `business-analyst`, `tech-lead`, `readiness-reviewer`, `delivery-orchestrator`, and `task-implementer` (`dev`, `quality-cycle`, and `pr-create` into the milestone branch). None of them merges.
- OpenCode agents: every agent is also generated as an OpenCode agent in `plugins/ai-skills/opencode/agent/<name>.md` (Rulesync `opencodev1` target, copied by `scripts/copy-opencode-agents.sh` in `npm run generate` and checked by `npm run check`), with the same body, `mode: all` so it runs as the main agent (`opencode run --agent <name>`) or as a subagent, no model, and `permission.edit: deny` for the read-only agents. `.opencode/` is gitignored.
- Shared `work-status` reference: one `status:<state>` label per issue, configurable labels, and the matching GitHub Project single-select field with configurable option names (`project-status-options`).
- One shared delivery profile, `docs/ai/delivery.md`, with the flow's inputs and defaults, including a `## Triage` section.
- `issue-resolver` agent: `intake` reads a source skill and keeps one deduplicated GitHub issue per source item, with a severity label from the delivery profile's hotfix criteria and the resolve label (`ai:resolve`); `resolve` fixes one issue on a hotfix branch into the default branch or a bugfix branch into the open release branch, runs the review and QA cycle, opens the PR, and stops. It never waits for approval and never merges.
- `sentry-issues` skill: lists unresolved Sentry issues with profile filters (projects, environment, period, minimum events and users, limit), reads events and in-app stack traces, writes tracker issue bodies with the dedupe marker `<!-- ai-issue source=sentry id=<id> -->`, and marks an issue resolved after merge when allowed. Credentials from `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and optional `SENTRY_BASE_URL`.
- Shared `non-interactive` reference: in CI (`CI` or `GITHUB_ACTIONS`) or when a caller says so, no skill asks or waits; each question point uses its non-interactive default or posts one blocker comment that mentions the requester and says to reply `/ai-resume` (optionally with instructions) where the resume workflow runs. Used by `dev`, `pr-create`, `qa-e2e`, `ticket-plan`, `pr-fix` (`auto` in CI), `quality-cycle`, `ship`, `todo`, `work-cleanup`, `observability-triage`, `sentry-issues`, and the orchestrator agents.
- Every issue the delivery flow creates or refines carries triage: `business-refinement` sets category labels, Priority, Start and Target date, and an initial Size, Estimate, and Effort; `technical-refinement` revises them after the plan and splits anything above the largest size; `readiness-review` sends an issue with missing triage back to technical refinement; `delivery-orchestration` starts issues by Priority and Target date.
- Mermaid diagrams in the docs: the delivery flow, stage chaining and `/ai-resume`, the branch model, the task PR follow-up, issue resolution, and the status labels in `docs/delivery-flow.md`; agent delegation, the skills each agent follows, and the `quality-cycle` loop in `docs/claude-code-agents.md`.

### Changed

- Ticket access gains the tracker's REST API with credentials already in the environment (for Jira `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) before the public URL option: read, comment, labels, and attachments, never printing the credentials.
- Triage reference covers Size, Effort, and Start and Target dates, a Size to Estimate scale, estimates from the history of similar closed work, GitHub Project fields and organization issue fields (the issue field wins when a project field mirrors it), and never overwrites values people set unless the scope changed, with a comment.
- `dev` can track the issue's status (`in-progress`, `in-review`) when a caller asks for it.
- Delivery steps leave a state a workflow can chain on: one status label per issue in scope, a blocker comment starting with `<!-- ai-delivery blocker stage=<stage> -->` and `Blocked: <line>` per blocked item, and a `Blocked:` list in each output. `task-implementer` never exits with the issue `in-progress`: an escalated cycle opens the PR labeled `ai:needs-human` (issue `in-review`), and an unclear requirement moves the issue to `technical-blocked`.
- `requested-by` input across the delivery flow, recorded in the milestone description as `<!-- ai-delivery requested-by=<login> -->`, used as assignee and milestone PR reviewer, and passed on to dispatched workflows that declare it.
- `business-refinement` with a GitHub milestone source treats the milestone's existing issues as the request and reorganizes them in place (rewrite with the original kept, retitle, split, merge); a blocked Jira source without a GitHub issue gets a tracking issue `JIRA:<key> - business refinement`; issues get an `## Attachments` section with each attachment's URL and a text description. Technical refinement splits or merges only for code reasons and downloads listed attachments.
- `delivery-orchestration` opens the milestone PR early as a draft that aggregates the task PRs, keeps its body current, marks it ready (requesting `requested-by`) when every issue is done, and after it merges moves every issue to `done` and closes the milestone.
- QA in CI: `qa-e2e`, `quality-cycle`, `qa-tester`, and `task-implementer` use a real browser on the scenarios for what the task changed when a CI setup command starts a test environment (new `QA in CI setup` and `QA browser` delivery profile lines, `CI setup` and `Browser tool` in the `qa-e2e` profile), and otherwise run targeted validation (focused tests for the new behavior, the app or API started headless to exercise the changed endpoints or commands, framework smoke checks) with a normal verdict from that evidence, never escalating only because there is no E2E setup.
- Branch model: release, feature, hotfix, and bugfix branches named by delivery profile templates (`Release branch template` default `release/{slug}`, `Feature branch template` default `feature/{release-slug}-{n}-{slug}`, `Hotfix branch template` default `hotfix/{slug}`, `Bugfix branch template` default `bugfix/{slug}`, plus `Bugfix release branch`). The milestone branch is the release branch; bugfix PRs target the open release branch (the oldest one when the profile names none, a blocker when there is none). No skill or agent hardcodes `feat/` or `fix/` anymore (`delivery-orchestration`, `milestone-delivery`, `nfse-compliance` with a new `Branch template` line, `ship`), and existing branches under older names are reused, never renamed. `work-cleanup` also protects `hotfix/*`.
- `merge-risk`: a `Base branches` list (exact names or patterns, or a caller-provided list) replaces the single base branch; an optional per-base table sets `Max risk to merge` and `Required human approvals` per base pattern; with 0 required approvals an empty review decision passes (only changes requested, or a review required by branch protection, holds), otherwise human approvals on the head commit are counted from the reviews, never from the review decision alone.
- Resume: handoffs and blocker comments tell the reader to reply `/ai-resume` (optionally with a stage and instructions) instead of ticking a checkbox. `docs/delivery-flow.md` documents the command, the per-run `instructions` input, the branch model, and issue resolution.
- `incident-responder` is now a deprecated alias of `issue-resolver`: it diagnoses with `observability-triage` and resolves a code defect through a GitHub issue and a PR, and no longer watches the PR or merges. The `observability-triage` profile drops its Automation section; fix automation lives in the delivery profile.
- `pr-create` and `ticket-create` take an assignee and skip `--assignee @me` with a GitHub App or bot token, where it fails. Ticket access maps Jira inline images to attachments with `expand=renderedFields`.
- Ticket skills (`ticket-ask`, `ticket-plan`, `ticket-create`, `dev`, `pr-create`, `review-changes`) download and read ticket attachments and inline images instead of skipping them: through the tracker's download action, including one an MCP server exposes only through discovery (such as the Atlassian server's Jira attachment download), then a tracker CLI or the REST API with credentials from the environment. Files go to a temp directory, are never executed, and are deleted afterwards.
- `pr-shepherd` takes a `Settle` input: `wait` (default) watches CI and new comments as before; `none` does one round and finishes with `awaiting events`, for event-driven runs started by a CI workflow that reacts to review events.
- `nfse-compliance` reads `PR follow-up` from the profile: `agent` (default) keeps the watch loop; `events` handles the feedback already on the PR once with `pr-shepherd` (Settle `none`) and stops with `awaiting review`. A resumed run on an approved PR still goes on to the merge decision.
- The `nfse-technical-note-analysis` profile template gains the `PR follow-up` Automation value, and `pr-fix` notes that `auto` mode suits event-driven runs.

## v0.5.0

### Added

- `work-cleanup` skill: after work is finished, lists the branches, worktrees, and optionally remote branches it left behind, classifies each as safe to remove or keep with a reason (protected, current, open PR, uncommitted changes, unpushed or unmerged commits), and deletes only the items the user confirms, never by force. Remote branches and `git branch -D` items are confirmed separately.

## v0.4.1

### Changed

- `nfse-compliance` reconciles an existing issue with the current profile and official sources before resuming it (decision, labels, estimate, due date, milestone), follows the profile's milestone policy (release milestone for deadline work, tracking milestone for watched work), and implements required changes from any source item the profile lists as implementable, not only technical notes.
- `nfse-compliance` searches open PRs and issues for the same change before branching, so two items about one change never open two PRs, and may prepare a production switch before the official date, which the merge decision holds until that date as a hard gate. A resumed issue is only reconciled, never re-created. Its report counts reconciled issues.
- The `nfse-technical-note-analysis` profile template gains the `Milestone policy`, `Awaiting-answer label`, and `Implementable sources` Automation values.

## v0.4.0

### Added

- Claude Code plugin `ai-skills` (`/plugin marketplace add fbrissi/ai-skills`, then `/plugin install ai-skills@fbrissi`) with every skill and nine agents, generated by Rulesync from `.rulesync/subagents/`.
- Worker agents: `code-reviewer`, `qa-tester`, `developer`, and `ci-investigator`.
- Orchestrator agents: `milestone-delivery` (milestone issues to reviewed and QA-approved PRs), `pr-shepherd` (open PR to approval), `incident-responder` (observability error to root cause, questions or a fix PR, optional merge), `inpi-watch` (RPI to tracked issues with labels and deadlines), and `nfse-compliance` (NFS-e technical note to estimated issues, implementation, PR, optional merge).
- `observability-triage` skill: traces a production error from Sentry, Datadog, or another tool to its root cause, with confidence and a recommendation. Read-only.
- `merge-risk` skill: rates a PR's production risk 1-5, checks the merge gates, and merges only when auto-merge is on, a human approved, and the rating is within the limit.
- `ticket-create` and `ticket-plan` set triage fields (estimate, category, priority, due date) when asked, per tracker.

### Changed

- `quality-cycle` delegates its Reviewer, QA, and Developer roles to the `code-reviewer`, `qa-tester`, and `developer` agents when they are installed.
- The `inpi-trademark-watch` and `nfse-technical-note-analysis` profile templates gain an Automation section read by their agents.

## v0.3.3

### Added

- `review-changes` loads a security and privacy reference when a change touches authentication, tokens, permissions, tenancy, personal data, secrets, storage, or retention. It covers access policy, account enumeration through status or timing, tenant filters on every query, secrets and personal data in logs and responses, LGPD purpose and retention for new data, deletion reach, and injection.

## v0.3.2

### Changed

- `review-changes` supports cumulative coverage for PRs too large for one pass: partial reviews publish `Covered:` / `Not covered:` lines and never approve, later passes read only the uncovered areas, and the PR is approved once the passes together cover every changed file with no unresolved finding. Output gains a `Coverage:` line.

## v0.3.1

### Changed

- `quality-cycle` keeps scenarios that QA marks `blocked` for lack of user input (credentials, certificates, devices) open until a fresh, delegated QA run executes them after the user provides what is missing; the orchestrator only performs the step that needs the user. The cycle no longer finishes with blocked scenarios in scope unless the user accepts it.
- `quality-cycle` requires scheduled jobs, queue consumers, and their e-mails to be triggered on purpose, and the profile template gains a `Scheduled job triggers` field.

## v0.3.0

### Added

- Add `bdd-scenarios`, which maps an application's features from its routes, views, API, docs, and tests and writes Gherkin feature files with priority, role, viewport, e-mail, and sandbox tags, a coverage matrix (feature × scenario × role), and an unmapped list for owner input.
- Add `qa-e2e`, which runs BDD scenarios in a real browser against a local or named staging environment, reviews UX/UI at desktop and mobile viewports, follows e-mail links through a local mail catcher, and writes a report with screenshots and an APPROVED or CHANGES REQUIRED verdict. Test environments and test credentials only.
- Add `quality-cycle`, which loops review (`review-changes`) and QA (`qa-e2e`) with developer fixes (`dev`) until both approve or a round limit escalates to the user, with full-diff reviews, sibling-path fixes, triage of lows into follow-ups, a cycle log, and a single push. Every referenced skill has a fallback.

## v0.2.0

### Changed

- Ticket handling is provider-agnostic: skills detect tracker URLs, `Closes ABC-123`-style keys, and branch-name keys (`feature/dev-420-x` -> `DEV-420`), then use whatever access exists, in order: an MCP server or connector, a project or harness tool, an authenticated CLI, or a public URL.
- `review-changes` no longer stops when a referenced ticket cannot be loaded. It reviews the diff alone, notes the missing ticket in its output and published review, and keeps the `Published:` line contract. Ticket skills (`ticket-ask`, `ticket-plan`, `ticket-create`, `dev`, `pr-create`) still stop and say which access is needed.

### Security

- Run the dependency audit through `scripts/audit-high.mjs`, which fails on high or critical advisories (or when the audit cannot complete) except dated entries in `audit-allowlist.json`. Allow the unpatched `picomatch` ReDoS advisory (GHSA-fc5q-39xc-vjpf), reachable only through dev tooling, until 2026-12-31.

## v0.1.1

### Changed

- Move the Code Review, release-note check, and release workflows to the shared reusable workflows in [`fbrissi/github-actions@v1`](https://github.com/fbrissi/github-actions). `code-review.yml`, `release.yml`, and `release-orchestrator.yml` are now thin callers; the review still uses the `review-changes` skill from the pull request's base commit.
- Dispatch Code Review on `main` instead of the pull request branch, so a pull request can no longer change its own reviewer workflow and open pull requests use the current review setup without a rebase.

## v0.1.0

### Added

- Add 11 harness-agnostic skills: `learn`, `skill-authoring`, `ticket-plan`, `ticket-ask`, `ticket-create`, `pr-create`, `pr-fix`, `review-changes`, `dev`, `ship`, and `todo`, adapted from the Kompass command set.
- Add `pr-checks`, which diagnoses failing PR checks (failing step, real error, cause class, fix) with `failed-checks.sh`, including dispatched runs and API check runs.
- Add `inpi-trademark-watch`, which analyzes an INPI RPI Marcas issue for a watched trademark and bundles `check-inpi-rpi.rb` to download issues.
- Add `nfse-technical-note-analysis`, which maps an NFS-e Nacional technical note to code changes and a homologation-first rollout plan.
- Add `flow-video-ad`, which plans a Google Flow ad with real screen footage and assembles the final video.
- Add project profiles (`docs/ai/<skill>.md`) so domain skills read project-specific values instead of hardcoding them.
- Add `pr-context.sh`, which loads a pull request's metadata, checks, reviews, comments, and open threads in one GraphQL call.
- `review-changes` ends with a stable `Published:` line, including `skipped (...)` values, so automation can tell a deliberate skip from a failure.
- Install and update with the `skills` CLI (`npx skills add fbrissi/ai-skills`, `npx skills update`), with Rulesync sources as an alternative.
- Commit the generated `AGENTS.md` and `CLAUDE.md` so agents get the repo guidance from a plain checkout.
- Add Quality Checks, Code Review (the `review-changes` skill run by OpenCode or Claude Code, picked with `AI_HARNESS`), and CHANGELOG-driven release workflows.
