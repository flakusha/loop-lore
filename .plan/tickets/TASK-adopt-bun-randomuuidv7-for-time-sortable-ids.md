# TASK: Adopt Bun.randomUUIDv7() for time-sortable IDs

**Status:** 🟡 Deferred (test-contract dependency)
**Priority:** medium
**Effort:** Medium

## Summary

Replace crypto.randomUUID() with Bun.randomUUIDv7() for database IDs and request IDs. Improves B-tree index locality, enables time-based sorting, reduces index fragmentation.

## Acceptance Criteria

- [ ] Implementation complete (BLOCKED on test-contract update)
- [ ] Tests passing
- [ ] Documentation updated

## Deferral note (2026-08-27)

`src/middleware/request-id.test.ts` and `src/middleware/request-id.integration.test.ts` assert a UUID **v4** regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-.../i`). `Bun.randomUUIDv7()` returns a UUID v7 (`7` in the version position) which does NOT match that regex.

Adopting `Bun.randomUUIDv7()` for request IDs in isolation would break 3+ tests and silently change the format downstream consumers (telemetry, log correlation, the idempotency subsystem) key on. The full migration requires:

1. Coordinated update of all `crypto.randomUUID()` call sites flagged by the scout (60+ files, including `src/chat/service/batch.test.ts`, `src/admin/model-capabilities.ts`, `src/battle/weather-integration/hazards.ts`, `src/characters/services/internal-traits/index.ts`, `src/chat/proactive/db-helpers.ts`, `src/db/seed.ts`, etc.).
2. DB schema compatibility audit: any column with `gen_random_uuid()` default would need a migration (rare but possible).
3. Test regex updates wherever v4 is asserted.

Out of scope for one worktree. Re-open when a coordinated sweep is feasible.
