<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Location Frontend

**Status:** ✅ Done (merged to dev 2026-09-15)
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** location, frontend, chat

## Resolution

Merged to dev in `991f6f050` (`feat(frontend): mount actor panels, export progress; drop orphan`):

- `src/frontend/alpine/chat-location.ts` (+ `.test.ts`) — get/set location.
- `src/components/chat/location-panel.html` — mounted via `{{> chat/location-panel.html }}` in `src/views/chat.html`.

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
