# BUG: BUG: message-seen DELETE handler trusts client actorId (IDOR)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/message-seen.ts DELETE handler lines 211-239: actorId is read from ctx.query and only resolveMessageAccess (chat-level access) is checked; there is no assertion that actorId equals the authenticated userId. Any chat participant can pass another participant actorId and delete that participants seen-state row. The POST path IDOR was filed as f0824a8; this covers the DELETE handler which has the identical flaw. Fix: derive the actor from the authenticated session (requireUserId) and reject when actorId != userId, or scope the delete to the callers own actorId.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
