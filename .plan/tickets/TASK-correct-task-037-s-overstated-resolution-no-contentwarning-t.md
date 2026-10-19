<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Correct TASK-037's overstated Resolution: no ContentWarning type, no content_warning event

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-nsfw-game-mechanics
**Tags:** plan, docs, nsfw
**Related:** `.plan/tickets/TASK-037.md`, `.plan/epics/epic-nsfw-game-mechanics.md`, `.plan/tickets/TASK-specify-content-warnings-write-the-frontend-contract.md`, `src/rpg/fantasies/service/types.ts`, `src/rpg/fantasies/service/discovery.ts`, `src/rpg/fantasies/service/fulfill.ts`, `src/nsfw/capability-gate.ts`

**Summary:**

`.plan/tickets/TASK-037.md` is marked `Done`, and its Resolution claims it shipped content-warning machinery that does not exist in the codebase. The ticket is therefore evidence for a feature that was never built. This ticket records that the Resolution overstates what shipped and closes the divergence.

Correcting TASK-037's own text is explicitly out of scope here. This ticket records that the correction is owed; the edit itself is a separate, later change.

**Context:**

## The false claims, verified against source (2026-10-19)

1. **`DiscoveryResult` has no `ContentWarning` field.** The Resolution states `attemptDiscovery(opts) → DiscoveryResult { triggered: boolean, category: FantasyCategory, warning?: ContentWarning }`. The real declaration at `src/rpg/fantasies/service/types.ts:70-74` is `DiscoveryResult { discovered: boolean; fantasy?: Fantasy; reason?: string }` — three fields, none of them a warning.

2. **No `nsfw.content_warning` event is emitted.** The Resolution states that extreme categories "emit a `nsfw.content_warning` event row before fulfillment", and repeats this in the acceptance-criteria checklist as verified. `src/rpg/fantasies/service/discovery.ts` is 96 lines and contains no event emission of any kind — its two failure returns (lines 43, 48) and its success return (line 66) all construct a plain `DiscoveryResult` literal.

3. **The only occurrence of `content_warning` in `src/` is a log string.** `src/rpg/fantasies/service/fulfill.ts:49` emits `log.warn(...)` with an `nsfw.content_warning:` prefix when a fantasy's intensity is `intense` or `extreme`. A `log.warn` call writes nothing to the database and surfaces nothing to a user. It is not an event row.

4. **The claimed barrel file does not exist.** The Resolution's first bullet describes `src/rpg/fantasy.ts` as a "thin barrel re-exporting `./fantasies`". There is no such file. Its own Related Files section hedges this entry as "speculative — file may not exist yet", and the hedge was correct.

## Why the overstatement matters

A `Done` ticket is a scheduling input. Anyone planning content-warning work reads TASK-037's checklist, sees four ticked boxes including "emit `nsfw.content_warning` event before fulfillment; verified by `discovery.test.ts`", and concludes the work is finished. It is not. This is the same class of defect as an epic carrying a wrong `Status:` — both make `.plan/` untrustworthy as a record of what exists.

The companion ticket `TASK-specify-content-warnings-write-the-frontend-contract.md` owns the forward-looking question of what a content-warning contract should say. This ticket owns only the backward-looking record correction. They must not be merged.

**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `TASK-037.md`'s Resolution no longer claims a `ContentWarning` type, a `warning` field on `DiscoveryResult`, or an `nsfw.content_warning` event row.
- [ ] `TASK-037.md`'s Resolution no longer claims `src/rpg/fantasy.ts` exists as a barrel, or the file is created so the claim becomes true.
- [ ] The `nsfw.content_warning` acceptance-criteria checkbox in `TASK-037.md` is unchecked or its text is restated to match what actually shipped — the `log.warn` line at `src/rpg/fantasies/service/fulfill.ts:49` and nothing more.
- [ ] Any code, test, or spec anywhere in the repo that depends on the claimed `ContentWarning` field or the claimed event row is identified and listed by path. A silent dependency would mean the claim was not merely a documentation error.
- [ ] A decision is recorded in this ticket's own Resolution — amend the TASK-037 text in place, or reopen TASK-037 as `Not Started` and re-scope it — with the reasoning for that choice stated.
- [ ] If TASK-037 is reopened rather than amended, its `Status:` and `Status Note:` are updated to match, and the reason for reopening is recorded in the ticket.
- [ ] `.plan/` contains no remaining `Done` ticket whose Resolution asserts a symbol or event that a source search cannot find.

## Caveats:

- **Record correction only, no implementation.** This ticket must not add a `ContentWarning` type, an event row, or any content-warning code. Writing the feature here would make TASK-037's overstatement true by accident while leaving every other consumer of its record still wrong. The forward-looking spec is owned by `TASK-specify-content-warnings-write-the-frontend-contract.md`.
- **Editing `TASK-037.md` is out of scope for this ticket.** This ticket's deliverable is the verification record plus the decision. It is expected that a follow-up change makes the actual edit, so that the verification and the correction land as separately reviewable steps.
- **The false claims were re-verified against source on 2026-10-19, not taken on trust.** Every line citation above was read directly. A later session must re-check them before acting, since the referenced files can move.
- **One claim is unambiguous, one is a judgement call.** The absent `warning` field and absent event emission are facts. Whether a `log.warn` naming an event should have counted as "shipping" the event is arguable, but the ticket text says "event row" and "surfaces nothing to a user", and a log line does neither. Do not use this ambiguity to reopen the whole question — settle the record.
- **Binding is to `epic-nsfw-game-mechanics` because that is TASK-037's own epic field.** `epic-frontend-age-gate` is not a fit: it is `Done` and its Status Note disclaims content warnings, so recording a divergence about content-warning claims there would attach the work to an epic that explicitly disowns it.
- **No test is being requested, and none should be added.** The defect is in a planning document. A regression test cannot fail on prose that has drifted from source. Checkability here is a source search, not a test run.
