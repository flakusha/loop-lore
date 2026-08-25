# BUG: Out-of-order fetch race in loadMessages

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/frontend/alpine/chat-messages.ts:21-40 loadMessages has no request token; rapid selectChat A->B lets A's slow response overwrite this.messages/totalPages while activeChat=B. Same tokenless pattern in loadOlderMessages:58-84. Fix: capture chatId/token at request start, discard stale responses.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
