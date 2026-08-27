# BUG: BUG: message create accepts parentId from any chat (cross-chat parent coupling)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/messages/create.ts sets parentId = body.parentId ?? null and passes it straight to insertUserMessageWithRetry with no check that the parent message belongs to chatId. A user who can access chat A can set parentId to a message id from chat B, coupling the new message under a foreign chat thread. checkChatAccess verifies chat A membership but not parent ownership. Fix: when parentId is provided, verify the parent message exists and its chat_id === chatId (404/403 otherwise).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
