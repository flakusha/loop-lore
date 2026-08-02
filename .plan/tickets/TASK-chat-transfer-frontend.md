# TASK: Chat Transfer Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** transfer, frontend, chat

## Summary

Create frontend UI for transferring chat ownership. Backend routes exist at `/api/chats/:id/transfer` but no frontend UI exists.

## Backend Routes (already exist)

| Route                     | Method | Purpose                 |
| ------------------------- | ------ | ----------------------- |
| `/api/chats/:id/transfer` | POST   | Transfer chat ownership |

## Files to Create

- `src/frontend/alpine/chat-transfer.ts` — Transfer component

## Acceptance Criteria

- [ ] Transfer chat button in chat settings
- [ ] User selection dialog
- [ ] Confirmation dialog
- [ ] Loading and error states

## Related

- `TASK-chat-transfer-location.md` — Existing task
- `epic-chat-transfer-location.md` — Transfer/location epic
