<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quest status transitions bypass state machine

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Related:** TASK-adopt-state-machine-framework-in-runtime-status-writes

## Summary

`transitionQuestStatus` (`src/story/shared/story-utils.ts:123`) is a blind two-table UPDATE with zero transition validation, even though a proper state machine (`questStatusMachine`, `src/db/enums-story/quests.ts`) is defined for exactly this purpose.

## Context

- Quest lifecycle (`src/story/quest-engine/lifecycle.ts`: `fail`, `abandon`) and any future status writer all funnel through `transitionQuestStatus`.
- Current behavior: terminal states `completed`/`failed` can be re-transitioned; `abandoned → active` is allowed by the machine def but enforced nowhere; any caller can set any status string.
- `questStatusMachine.canTransition()` + `CompositeValidator` (quest status × progress status) exist in `src/db/state.ts` and are unused.
- Progress rows (`quest_progress`) are updated in the same blind write, so an invalid status pair (e.g. quest `completed` + progress `active`) is writable.

## Acceptance Criteria

- [ ] `transitionQuestStatus` validates `questStatusMachine.canTransition(from, to)` and throws `TransitionError` on invalid moves
- [ ] Quest status × progress status validated via `CompositeValidator` (questStatus × questProgressStatus allowed pairs)
- [ ] `questStatusMachine.initial`/`terminal` used by callers where applicable (e.g. `createQuest` uses the defined initial)
- [ ] Unit tests: valid transitions succeed; invalid re-transitions from terminal states throw; invalid status pairs throw
- [ ] `bun test src/` green (quest, quest-engine, story-utils suites)
