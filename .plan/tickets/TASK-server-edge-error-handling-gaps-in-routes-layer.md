# TASK: Server-edge error handling gaps in routes layer

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/server/handler.ts:60 — no top-level catch around app.fetch(taggedRequest): unexpected route throw = unhandled rejection at server edge; wrap → generic 500 + requestId. src/validation/middleware.ts:26 — verify onError UNKNOWN branch does not echo error.message to client (default Elysia 500 leaks internals). Also messages/update.ts:88 PUT status returns ok:true even when message missing (404 unreachable — check affected rows); chat-sections/bulk.ts:60 bulk move assumes target sectionId belongs to chatId (add takeFirst check); location-explorer.ts:66 unpaginated tree endpoint can dump entire locations+states tables (add cap).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
