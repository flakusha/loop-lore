# TASK: Chat Pins Frontend

**Status:** ✅ Done — pins panel + Alpine component wired (0395b7af)
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** pins, frontend, chat, messages

## Summary

Create frontend UI for pinning/unpinning messages. Backend routes exist at `/api/chats/:id/pins*` but no frontend UI exists.

## Backend Routes (already exist)

| Route                        | Method | Purpose       |
| ---------------------------- | ------ | ------------- |
| `/api/chats/:id/pins`        | GET    | List pins     |
| `/api/chats/:id/pins`        | POST   | Pin message   |
| `/api/chats/:id/pins/:pinId` | DELETE | Unpin message |

## Files to Create

- `src/frontend/alpine/chat-pins.ts` — Chat pins component
- `src/components/chat/pins-panel.html` — Pins panel template

## Acceptance Criteria

- [ ] Pin/unpin button on messages
- [ ] Pinned messages list
- [ ] Pin indicator on messages
- [ ] Loading and error states

## Related

- `epic-chat-lifecycle-moderation.md` — Chat lifecycle epic
