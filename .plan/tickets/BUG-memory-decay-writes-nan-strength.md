# BUG: memory decay writes NaN strength

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

src/memory/purge.ts:55 const lastAccessed = mem.last_accessed_at ?? mem.id (uuid string) -> new Date(uuid)=Invalid -> decay NaN -> strength NaN on any memory with NULL last_accessed_at; breaks strength>0 filters/purge/injection order. purge.test.ts always sets last_accessed_at. Fix: null-coalesce to created_at or now; add test.

## Resolution

Fixed in `applyDecay` (`src/memory/purge.ts`): the decay query now selects `created_at` alongside `last_accessed_at`, and `lastAccessed` falls back `mem.created_at ?? now.toISOString()` — never the UUID `id` (`new Date(uuid)` is Invalid, which produced `elapsedMs` NaN and persisted `strength` NaN).

Tests: `src/memory/purge.test.ts` — "applyDecay > should not write NaN strength when last_accessed_at is NULL" seeds a memory with `last_accessed_at = NULL`, `strength = 0.5`, `decay_rate = 0.1` and asserts the re-read strength is finite and `<= 0.5` (0 after 10-day clamp). Full `bun test src/routes/worlds src/memory/purge.test.ts`: 30 pass, 0 fail.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated