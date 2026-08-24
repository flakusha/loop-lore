# BUG: Stream cancel leaves attempt stuck Processing forever — no cleanup/persist

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/generate-route/stream-to-client.ts:228 — cancel() aborts provider but never persists partial content, never calls failGeneration, never signals buffer done; attempt stays Processing in activeGenerations indefinitely, reconnect consumers hang on open buffer. Also :146 user-cancel mid-tool-round surfaces as AbortError → marked Failed not Cancelled; :80 void .then() fire-and-forget without catch (banned pattern), cancel decision applied async while chunks keep enqueueing. Fix: cleanup in cancel(), distinguish AbortError, await/buffer action.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
