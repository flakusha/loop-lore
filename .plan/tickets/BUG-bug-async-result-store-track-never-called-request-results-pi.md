# BUG: BUG: async result store track() never called; request_results pipeline is a no-op

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/async/store.ts exposes track() (upsert into request_results) but no production caller supplies an asyncStore to maybeAutoReply (src/routes/messages/reply.ts guards on asyncStore !== undefined, and src/routes/messages/create.ts calls maybeAutoReply WITHOUT asyncStore). src/middleware/lifecycle.ts only calls complete/fail (UPDATEs), never track. Result: request_results rows are never created, so GET /api/requests/:id/status always 404s and idempotency table-backend replay is dead. Fix: wire an asyncStore into the messages-create route / elysia-app lifecycle so track() runs on request start, or remove the dead feature.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
