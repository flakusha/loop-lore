# BUG: routes: message-seen POST/DELETE trusts client actorId (IDOR) and races on insert

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/routes/message-seen.ts lines 118-178 read actorId from the request body/query and only verify chat access (resolveMessageAccess line 131), not actor ownership. Any chat participant can mark or delete any actor (incl. other users characters) as seen/processing. Also SELECT-then-INSERT (lines 149-177) races on concurrent requests. Fix: requireActorAccess(actorId, userId) before mutation; use the service upsert (chat/service/seen.ts onConflict).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in src/routes/message-seen.ts (requireActorAccess before mutation; unique-index upsert replaces select-then-insert; migration 072). Verified in this worktree (round-6 batch, 2026-09-06).
