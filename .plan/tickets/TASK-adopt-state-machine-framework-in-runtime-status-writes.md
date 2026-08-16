<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt state machine framework in runtime status writes

**Status:** ✅ Done
**Priority:** medium
**Effort:** Large
**Related:** TASK-quest-status-transitions-bypass-state-machine

## Summary

7 machines defined, 0 enforced at runtime; route status writes through StateMachine.

## Context

The generic state machine framework (`src/db/state.ts` — `StateDef`, `StateMachine`, `CompositeValidator`, `TransitionError`) is defined and clean but effectively dead in runtime code.

Machines defined but never consulted at runtime:

- `messageStatusMachine`, `messageVisibilityMachine` (`src/db/enums-core/messages.ts`) — message writes set status freely
- `questStatusMachine` (`src/db/enums-story/quests.ts`) — see TASK-quest-status-transitions-bypass-state-machine
- `playerAchievementStatusMachine`, `playthroughStatusMachine`, `skillLockStateMachine`, `vnChoiceStatusMachine` (`src/db/enums-story/rpg.ts`)
- `nsfwAccessStatusMachine` (`src/db/enums-core/moderation.ts`) — `mod-actions.ts` claims to use it but enforcement is manual `throw` with no `canTransition` calls
- `src/db/enums-story/turns.ts` comment claims "State Machine (used by story/synthetic/generator.ts)" but no machine is defined for turns — stale comment; turn transitions are free-form

Side effects of non-adoption:

- Magic strings in writes/reads (`"active" as never` in `story-utils.ts:139`, `synthetic/runner/gm.ts:26`, `synthetic/generator/builders.ts:105`) instead of enum constants
- `optimistic-locking.ts` bypasses column typing with heavy `as never` casts
- Terminal-state re-transitions silently accepted across domains

## Acceptance Criteria

- [ ] Inventory: every status/visibility column write routes through its machine (`canTransition`/`assertValid`) or a documented deliberate exception
- [ ] Turns: either define `turnStatusDef` + machine and enforce it in `story/synthetic/generator.ts`, or fix the stale comment — pick one
- [ ] `nsfw/moderation-service/mod-actions.ts` replaces manual state guards with `nsfwAccessStatusMachine.canTransition`
- [ ] Magic string status literals replaced with enum constants at all identified sites
- [ ] `as never` casts removed where enum-typed queries suffice
- [ ] Unit tests per machine: valid/invalid transitions, terminal detection
