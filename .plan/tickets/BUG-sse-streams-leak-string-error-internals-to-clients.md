# BUG: SSE streams leak String(error) internals to clients

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Small

## Summary

`src/routes/activity-stream.ts:87` and `src/routes/notifications/stream.ts:72` send `String(error)` over SSE to clients, leaking internal details (stack frames, file paths, query fragments) to the browser.

**Fix**: emit a generic client message ("stream error, retry"), route the full error to server-side logger with correlation id. Client can show "retry" while ops can correlate by id.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in `faec1501` (round 3): `src/routes/activity-stream.ts` and `src/routes/notifications/stream.ts` now send a generic "stream error, retry" client message and route full error detail (with correlation id) to the server-side logger. Verified present on dev; status flipped from Not Started.
