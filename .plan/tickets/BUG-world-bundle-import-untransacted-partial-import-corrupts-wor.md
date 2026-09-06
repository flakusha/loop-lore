# BUG: World bundle import untransacted — partial import corrupts world

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/world-import/bundle.ts:106-179 — multi-table import (lore entries, quests, world_states, location_states...) has no .transaction() anywhere in file. Fix: wrap whole bundle insert in tx.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

world-import/bundle.ts importWorldBundle wraps all 7 table inserts in database.transaction() — a mid-import failure rolls back the whole bundle. (resolved 2026-09-06)
