# BUG: location connections validation accepts junk and persists it

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

src/routes/worlds/locations.ts:69-112 validateConnections silently drops non-string entries, but handlers persist the RAW body.connections (159-164, 247-251) -> stored JSON can hold 123/{} where consumer code expects location ids. Fix: typed Elysia body schema + fail on invalid entries.

## Resolution

Fixed in `validateConnections` (`src/routes/worlds/locations.ts`): non-string entries now return `400 ValidationError` ("connections must be an array of location id strings") instead of being silently skipped. Since both `handleCreateLocation` and `handleUpdateLocation` call `validateConnections` before `safeJsonStringify(body.connections)`, only validated string arrays are persisted.

Tests: `src/routes/worlds/locations-routes.test.ts` — "2.8: connections with non-string entries are rejected with 400" (POST `connections: [123, {}]` → 400, nothing persisted) and "2.8: valid string connections persist as JSON strings only" (201 + stored JSON round-trips as strings). Full `bun test src/routes/worlds src/memory/purge.test.ts`: 30 pass, 0 fail.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated