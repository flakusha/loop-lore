<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Actor Turn Skip ('Continue' Without Breaking the Story)

**Status:** Not Started
**Priority:** Medium
**Effort:** Small–Medium
**Type:** Feature Epic
**Tags:** turn-skip, pass, continue, cadence, gm, group-chat
**Related:** epic-immersion-consistency-gate.md (conflict resolution below), epic-group-chat.md (turn cascade), epic-assistant-gm-flows.md (GM beat generation), epic-actor-autonomy-story-drive.md (turn queue)

## Summary

An explicit **'skip turn'** control letting the actor (user) decline to act this beat
*without* breaking the story: the GM/narration advances the scene, other actors react to
the absence plausibly, and no fake action is attributed to the skipping actor.

**Naming caution:** "Continue" is already taken — `src/generation/continuation.ts`
implements resume-of-partial-cancelled-output. This feature MUST ship under a distinct
name (`pass` / `skip turn`) in UI, API, and code to avoid semantic collision.

## Current State (reviewed 2026-09-01)

- No skip/pass mechanism: generation is driven by user messages only
  (`GameMasterService` is reactive — see epic-actor-autonomy-story-drive Current State).
- `Continue` exists with different semantics (partial-output resume).
- Group-chat cascade has max-turns / consecutive-turn guards but no notion of an actor
  *passing* its slot.
- A user with nothing to do today either writes filler action (immersion risk — the
  exact pressure epic-immersion-consistency-gate defends against) or stalls the scene.

## Design

- **Skip record** — a persisted turn event `turn_skip {actor, beat, mode}`; context
  assembly renders it as absence, never as an action.
- **Two modes:**
  - `hold` — same beat continues; actor conspicuously inactive (GM may spotlight them later).
  - `advance` — GM may progress time/scene past the actor's inaction ("meanwhile…").
- **GM handling** — prompt contract: an absent actor is *not* narrated into autonomous
  action; other actors may notice, react, or the scene moves on.
- **Interaction with the consistency gate (point 2 of the feature set):**
  - Skip is **never gated** — there is no claim to contradict; it cannot be refused.
  - When a message is `hard-block`ed, the refusal notice MUST offer skip as the escape
    hatch — a blocked actor is never trapped with "edit or stall".
  - A `soft-refuse` (attempted action narrated as obstacle) **consumes the turn**; the
    actor may not skip after being refused for the same beat (one outcome per beat).
- **Group chat** — a skip releases the slot to the next actor in the cascade; solo chat —
  skip triggers GM/ambient beat generation (subject to generation-flow-control budget).

## Work Items

- [ ] **turn_skip event + persistence** — schema, API route, context-assembly rendering. → TASK-turn-skip-event
- [ ] **GM absence contract** — prompt + acceptance rules for hold/advance handling. → TASK-turn-skip-gm-handling
- [ ] **Cascade integration** — slot release in group chat; budgeted beat in solo. → TASK-turn-skip-cascade
- [ ] **Gate interlock** — refusal-notice offers skip; refused-beat cannot also be skipped. → TASK-turn-skip-gate-interlock
- [ ] **UI** — 'Skip turn' composer control with hold/advance choice. → TASK-turn-skip-ui

## Non-Goals

- Auto-driving the skipping actor (autonomy epic; explicitly gated off by the absence contract)
- Time-scale mechanics for `advance` beyond "GM may elapse scene time" (`epic-time-scale.md` owns clocks)

## Acceptance Criteria

- [ ] Skip → generated turn attributes no action to the skipping actor (scorer/verifier check).
- [ ] Hard-blocked message path exposes working skip action in ≤1 click from the refusal notice.
- [ ] Group chat with one skipping actor continues the cascade; no max-turns guard misfire.
- [ ] `advance` mode visibly progresses the scene (GM beat changes location/time cues); `hold` does not.
