# BUG: SSE streams leak String(error) internals to clients

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

`src/routes/activity-stream.ts:87` and `src/routes/notifications/stream.ts:72` send `String(error)` over SSE to clients, leaking internal details (stack frames, file paths, query fragments) to the browser.

**Fix**: emit a generic client message ("stream error, retry"), route the full error to server-side logger with correlation id. Client can show "retry" while ops can correlate by id.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
