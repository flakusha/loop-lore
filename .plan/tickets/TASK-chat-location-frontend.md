# TASK: Chat Location Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** location, frontend, chat

## Summary

Create frontend UI for setting/viewing chat location. Backend routes exist at `/api/chats/:id/location` but no frontend UI exists.

## Backend Routes (already exist)

| Route                     | Method | Purpose           |
| ------------------------- | ------ | ----------------- |
| `/api/chats/:id/location` | GET    | Get chat location |
| `/api/chats/:id/location` | PUT    | Set chat location |

## Files to Create

- `src/frontend/alpine/chat-location.ts` — Location component

## Acceptance Criteria

- [ ] Location display in chat header or character info
- [ ] Location selection dialog
- [ ] Location change notification
- [ ] Loading and error states

## Related

- `TASK-chat-transfer-location.md` — Existing task
- `epic-chat-transfer-location.md` — Transfer/location epic
