<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-agency-coordination-priority: Autonomy scheduler defers on pending player intent

**Status:** Draft
**Priority:** P1 (within EPIC-RESEARCH-AGENCY-QUALITY)
**Effort:** 1 day
**Parent epic:** `epic-research-agency-quality.md`
**Related:** `epic-actor-autonomy-story-drive.md` (scheduler), `src/turning/turn-manager/` (`participants.ts`, `selection.ts`), `src/generation/auto-gen/pass-filter.ts`

**Summary:**

## Goal

When a player message is in flight on a scene, the autonomy scheduler **defers one tick** before dispatching any autonomous NPC action that would foreclose a player choice.

**Context:**

## Why

- DiGRA (2025): autonomous NPCs can **erode** player agency by pre-empting choices (the NPC sells the magic sword before the player meets the merchant).
- The fix is coordination, not removal of autonomy - defer one tick, queue the action, run it next beat.

**Acceptance Criteria:**

- [ ] Autonomy scheduler checks `pending_player_intent` for the active scene before dispatching any NPC reaction or autonomous action.
- [ ] When intent is pending, action is **queued** (not dropped) and dispatched on the next tick after intent resolves.
- [ ] Test: synthetic two-actor scene with simultaneous player input + autonomy tick; verifies deferral.
- [ ] Telemetry: deferred-action count, mean deferral latency.
- [ ] Does **not** change the cost governor: deferred actions still consume budget when they run.

## Out of Scope

- Multi-player coordination (player-vs-player deferral).
- Hard pause-on-player (defer semantics only; the user can already pause the whole scheduler).


git issue: 31b4d5d
