# BUG: chat vn-choices IDOR cross-user read and select

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Location: src/routes/chats/vn-choices.ts (handleListVnChoices GET /chats/:id/vn-choices, handleSelectVnChoice POST /chats/:id/vn-choices/:choiceId/select) delegating to src/chat/service/vn-choices.ts.

Symptom: Handlers pass only chatId/choiceId to listVnChoices/selectVnChoice. The service functions take NO userId/userRole and filter purely by id (verified: selectFrom(vn_choices).where(chat_id, chatId)). Confirmed by direct source read. Result: ANY authenticated user can read another chat's VN choices and set status='selected' on them (cross-user read + state tampering in someone else's scene flow).

Root cause: the vn-choices route surface was added without the checkChatAccess/participant check that sibling chat routes use, and the service layer lacks a userId parameter.

Fix: pass userId/role into the handlers and enforce checkChatAccess (admin.chat || created_by === userId || chat_participants.actor_id === userId) — either in the handler or by adding userId to the service signatures.

Acceptance: cross-chat vn-choice read/select denied; owner/participant/admin succeeds; regression test added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
