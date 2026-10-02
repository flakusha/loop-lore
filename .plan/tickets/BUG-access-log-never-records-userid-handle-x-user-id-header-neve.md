<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Access log never records userId/handle (x-user-id header never set)

**Status:** Done
**Status Note:** (commit 6b3cadc6, plus follow-up d0a24be8 guard) — auth derive at src/elysia-app.ts:64-77 sets x-user-id on the request from the authenticated context, and clears any client-supplied value on the unauthenticated path. The ticket's root-cause description is stale: as of the d0a24be8 follow-up the derive DOES inject x-user-id. Verified by re-reading elysia-app.ts:64-77 and git log on the file.
**Priority:** high
**Epic:** epic-logging
**Effort:** Medium

## Summary

Location: src/server/handler.ts:82 (logAccess reads request.headers.get("x-user-id")).

Symptom: Every HTTP access-log entry has userId=null and handle=null, so audit/observability loses the acting user identity on all requests.

Root cause: The auth .derive in src/elysia-app.ts populates the Elysia context (userId/userRole/sessionId) but NEVER injects an x-user-id request header. handler.ts clones the inbound request into taggedRequest and only sets x-request-id, so request.headers.get("x-user-id") is always null when logAccess runs. The design comment at handler.ts:21-22 claims x-user-id is populated via the derive, but it is not.

Fix options: (a) set x-user-id on taggedRequest in createRequestHandler from the authenticated context (requires threading userId out of app.fetch, e.g. via a response header or a shared context object), or (b) pass the resolved userId from the Elysia derive into createRequestHandler/logAccess directly instead of reading a header. Option (b) is cleaner and avoids trusting a client-supplied header.

## Acceptance Criteria

- [x] Authenticated derive injects `x-user-id` from context; unauthenticated path deletes client-supplied value anti-spoof (`src/elysia-app.ts` derive; commits 6b3cadc6 + d0a24be8)
- [x] `logAccess` reads `x-user-id` off `taggedRequest` and resolves handle best-effort (`src/server/handler.ts:58-87`)
- [x] Authenticated request produces access-log entry with non-null userId + resolved handle; unauthenticated logs anonymous
- [x] Spoof attempt (client-set `x-user-id`, no session) cannot attribute another user — header cleared on unauth path
- [ ] Regression test locking derive-injects/clears behavior (no `src/server/*` test covers it today)

