# TASK: Message Archive/Restore Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** archive, restore, frontend, messages

## Summary

Create frontend UI for archiving and restoring messages. Backend routes exist at `/api/messages/:id/archive` and `/api/messages/:id/restore` but no frontend UI exists.

## Backend Routes (already exist)

| Route                       | Method | Purpose         |
| --------------------------- | ------ | --------------- |
| `/api/messages/:id/archive` | POST   | Archive message |
| `/api/messages/:id/restore` | POST   | Restore message |

## Files to Create

- `src/frontend/alpine/message-archive.ts` — Archive/restore component

## Acceptance Criteria

- [ ] Archive button on messages
- [ ] Restore button on archived messages
- [ ] Archived messages section
- [ ] Confirmation dialog
- [ ] Loading and error states

## Related

- `TASK-message-archiving.md` — Existing task
