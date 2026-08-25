# BUG: Access log never records userId/handle (x-user-id header never set)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Location: src/server/handler.ts:82 (logAccess reads request.headers.get("x-user-id")).

Symptom: Every HTTP access-log entry has userId=null and handle=null, so audit/observability loses the acting user identity on all requests.

Root cause: The auth .derive in src/elysia-app.ts populates the Elysia context (userId/userRole/sessionId) but NEVER injects an x-user-id request header. handler.ts clones the inbound request into taggedRequest and only sets x-request-id, so request.headers.get("x-user-id") is always null when logAccess runs. The design comment at handler.ts:21-22 claims x-user-id is populated via the derive, but it is not.

Fix options: (a) set x-user-id on taggedRequest in createRequestHandler from the authenticated context (requires threading userId out of app.fetch, e.g. via a response header or a shared context object), or (b) pass the resolved userId from the Elysia derive into createRequestHandler/logAccess directly instead of reading a header. Option (b) is cleaner and avoids trusting a client-supplied header.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
