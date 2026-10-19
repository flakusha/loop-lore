<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Specify content warnings: write the frontend contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics
**Tags:** nsfw, frontend, content-warnings, spec
**Related:** `.plan/epics/epic-frontend-age-gate.md`, `.plan/epics/epic-nsfw-game-mechanics.md`, `.plan/tickets/TASK-037.md`, `.plan/tickets/TASK-nsfw-reputation-consequences.md`

**Summary:**

The age-gate epic is titled "Age Gate & Content Warnings", but only the age-gate half exists. `epic-frontend-age-gate.md` is `Done` and its Status Note disclaims content warnings as historical naming, explicitly out of scope. That leaves a named feature with no owner, no spec, and no ticket — this ticket establishes the contract before any code is written.

This is a SPECIFICATION ticket. It must not ship an implementation; the deliverable is a written contract that a later ticket can be built against.

**Context:**

## Current state (verified 2026-10-19)

There is no user-facing content-warning machinery anywhere in the repo:

- No `docs/frontend/content-warnings.md`, and no mention of content warnings in any file under `docs/frontend/`.
- No `ContentWarning` type, no `content_warning` column, and no content-warning view, partial, or Alpine component in `src/`.
- The only occurrence in shipped code is a server-side log line: `src/rpg/fantasies/service/fulfill.ts` emits `log.warn("nsfw.content_warning: ...")` when a fantasy of `intense` or `extreme` intensity is fulfilled. It writes nothing to the database and surfaces nothing to a user.
- `.plan/tickets/TASK-037.md` is marked Done and its Resolution claims an `nsfw.content_warning` event row and a `ContentWarning` field on `DiscoveryResult`. Neither exists: `src/rpg/fantasies/service/types.ts` declares `DiscoveryResult { discovered, fantasy?, reason? }` with no warning field, and `discovery.ts` emits no event. That ticket's resolution overstates what shipped.
- `.plan/tickets/TASK-nsfw-reputation-consequences.md` (Not Started) lists "Content warning system for other players when interacting" and "Frontend content warning indicators in chat" as two unchecked acceptance criteria within a broader reputation system. It defines no contract and has no spec.
- `epic-nsfw-game-mechanics.md` carries "Content warnings: Should mechanics trigger content warnings for extreme kinks?" as Open Question 5, still unanswered.

## Scope of the work

Write the spec only. Do not create migrations, services, controllers, views, or Alpine components. Do not modify the fantasy fulfillment path.

The spec must resolve the questions that are currently open, and must state its answer to Open Question 5 in `epic-nsfw-game-mechanics.md` so that epic and this ticket stop disagreeing about whether the feature exists.

**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] A spec exists at `docs/frontend/content-warnings.md`, following the same section structure as `docs/frontend/age-gate.md` (URL / Overview / When It Shows / Layout / States / Data Model).
- [ ] The spec states where a warning is produced, naming the source that will emit it: the existing `intense`/`extreme` intensity branch in `src/rpg/fantasies/service/fulfill.ts`, the `ContentIntensity` tier in the canonical `src/db/enums-character/nsfw.ts` enum family, or a new dedicated detector — with the choice stated, not left implicit.
- [ ] The spec defines the user-visible behaviour for each case in a table: a warning is shown, a warning is hidden, a warning is collapsed until clicked, and no warning at all (below-threshold content).
- [ ] The spec defines the persistence contract: the exact table name and column names that store a warning, or an explicit statement that warnings are derived at render time and never persisted. No ambiguity is permitted here.
- [ ] The spec defines the suppression contract: the exact user preference that dismisses a warning, its scope (session / chat / account), and the behaviour when suppressed content is encountered again.
- [ ] The spec states whether a content warning is enforceable server-side or presentation-only, and names the enforcement point if server-side.
- [ ] The spec names the answer to Open Question 5 in `epic-nsfw-game-mechanics.md`, and a pointer to this spec is added to that epic's Open Questions section so the two documents agree.
- [ ] `epic-nsfw-game-mechanics.md` Open Question 5 is marked resolved rather than left as a live question.
- [ ] The spec states explicitly that it is the frontend contract and does not re-specify the NSFW gate's consent ledger (`src/middleware/nsfw-gate/consent-ledger.ts`) or rating enforcement, which are separate and already shipped.

## Caveats:

- **Design decision, not implementation.** Every acceptance criterion is about a written, checkable contract in `docs/frontend/content-warnings.md`. Writing code here defeats the ticket: an implementation written before the contract is settled is what produced TASK-037's overstated resolution.
- **Do not duplicate the NSFW gate.** Content gating — consent, rating ceilings, age — is owned by `src/middleware/nsfw-gate/`. This ticket's spec must consume those verdicts, not reimplement them.
- **TASK-037's resolution is inaccurate.** It claims a `ContentWarning` type and event row that do not exist in the code. Do not treat TASK-037 as evidence that content warnings shipped. Correcting that ticket's resolution text is out of scope here and should be filed separately.
- **TASK-nsfw-reputation-consequences.md overlaps.** Two of its unchecked acceptance criteria describe content warnings in chat. Its primary subject is social reputation, and its content-warning criteria are undefined beyond a single line each. This ticket owns the content-warning contract; that ticket should reference it rather than specify in parallel. Confirm the split before implementing either.
- **Binding is deliberate.** `epic-frontend-age-gate` is `Done` and disclaims this work, so binding there would contradict the reconciliation landed against it. `epic-nsfw-game-mechanics` is `Not Started`, is the epic whose Open Question 5 this resolves, and does not disclaim it — so this ticket binds there instead.
- **Unanswered product question.** Whether content warnings are user-configurable, admin-curated, or both is not decided anywhere in the repo. The spec must decide it explicitly rather than deferring, since every downstream implementation depends on the answer.
