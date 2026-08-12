# TASK: Consolidate Quest Engines

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-quests-encounters

## Summary

Resolve the dual quest system: `src/rpg/quests/` (`QuestService`) AND `src/story/quest-engine` BOTH write the `quests` table. Pick the canonical engine, route the other through it (or delete it), and back it with tests. PRECEDES TASK-wire-quests-routes — consolidation must land before quest routes are wired.

## Acceptance Criteria

- [ ] Single canonical quest engine identified; the other is routed through it or removed
- [ ] No remaining code paths write `quests` via two divergent engines
- [ ] Consolidation backed by tests (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)
- [ ] QuestService (CRUD + objectives + progression + rewards) remains intact for wiring

## Linked Epics

- `epic-quests-encounters.md`
