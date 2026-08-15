# TASK: Consolidate Quest Engines

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — dual quest system (`rpg/quests` vs `story/quest-engine`) consolidated to single engine; `src/rpg/quests/service/` removed
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

## Residual Gap

Consolidation merged the engines but did NOT reconcile the quest **type taxonomy**:
the create form still emits narrative-role values (`main|side|bounty|daily`) as
`type`, while the backend `QuestType` enum is completion-mechanic
(`time|collection|...`). This 422s on submit. Harmonized separately in
TASK-harmonize-quest-type-taxonomy.
