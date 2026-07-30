# EPIC: Archival Workflow

**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** archival, soft-delete, retention, purge, data-lifecycle

## Summary

Message archival flow — soft-delete with retention, restore, and permanent purge. Covers state machine, cascade rules, retention policy, UI flows, and API endpoints.

## Reference

- Spec: `docs/spec/archival-workflow.md` (authoritative)

## Design

### State Machine

| State    | Description           | Transitions     |
| -------- | --------------------- | --------------- |
| active   | Normal message        | archive, delete |
| archived | Hidden but restorable | restore, purge  |
| purged   | Permanently deleted   | none            |

### Cascade Rules

**Archive:**

1. Archive all messages (set `archived_at` timestamp)
2. Link archived assets to archival record
3. Preserve in separate partition/table

**Restore:**

1. Restore all messages in chat
2. Restore linked assets
3. Rebuild indexes

**Purge:**

1. Permanent deletion
2. Cascade delete linked assets
3. Notify participants

### Retention Policy

- Default: 90 days in archived state
- Configurable by admin in system settings
- Purge becomes available after retention period
- GC runs daily to clean expired archives

### API Endpoints

```
POST /api/chats/:id/archive    → 200 { archived_at }
POST /api/chats/:id/restore    → 200
DELETE /api/chats/:id/purge    → 204
```

## Tasks

- [ ] Archive state column (`archived_at` timestamp on chats/messages)
- [ ] Archive endpoint — soft-delete with cascade
- [ ] Restore endpoint — reverse archival
- [ ] Purge endpoint — permanent deletion with cascade
- [ ] Retention policy config (admin settings)
- [ ] GC job — daily sweep of expired archives
- [ ] Archived chats view (`/views/archived`)
- [ ] Archive button in chat menu (three dots)
- [ ] Confirmation dialogs (archive, purge)
- [ ] Asset cascade logic (link/unlink on archive/restore/purge)
- [ ] Notification on purge (participants)

## Files

- `src/routes/chats.ts` — archive/restore/purge endpoints (extend existing)
- `src/chat/service.ts` — archival business logic
- `src/db/migrations/` — add `archived_at` columns if needed
- `src/frontend/archived.html` — archived chats view (TBD)
- `src/gc/` — retention GC job (TBD)

## Acceptance Criteria

- [ ] Archive sets `archived_at` on chat + messages
- [ ] Restore clears `archived_at` and rebuilds indexes
- [ ] Purge permanently deletes with asset cascade
- [ ] Retention policy configurable
- [ ] GC cleans expired archives daily
- [ ] Archived view shows restorable chats
- [ ] Confirmation dialogs for destructive actions
- [ ] Tests passing

## Related Epics

- `epic-chat-lifecycle-moderation.md` — chat lifecycle states
- `epic-messages.md` — message model
- `epic-assets.md` — asset cascade
- `epic-logging.md` — audit logging for purge events

## Tickets

- `TASK-archival-workflow.md` — implementation tasks
