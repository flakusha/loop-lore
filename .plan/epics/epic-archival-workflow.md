<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Archival Workflow

**Overview:** (see sections below)


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

- [x] Archive state column — messages.archived_at shipped at src/db/migrations/001_init.ts:1874 (chats reuse is_pinned=PinnedState.Archived as the soft state)
- [x] Archive endpoint — POST /api/chats/:id/archive (src/routes/chats/archive-routes.ts → src/chat/service/crud/archive.ts)
- [x] Restore endpoint — POST /api/chats/:id/unarchive (same files)
- [ ] Purge endpoint — gap-audit 2026-09-23 (hardDeleteChat exists at src/chat/service/visibility.ts:64-74 with no HTTP route)
- [ ] FEAT-chat-level-purge-route-delete-api-chats-id-purge (issue ff4f4d8) — DELETE /api/chats/:id/purge calling hardDeleteChat, admin-only, cascades asset_links
- [ ] Retention policy config — gap-audit 2026-09-23 (log_retention_days at admin/config.ts:144 is audit-log scope; need archive_retention_days)
- [ ] GC job — gap-audit 2026-09-23 (src/gc/ directory does not exist)
- [x] Archived chats view — filter at src/routes/chats/list.ts, Alpine chat-filters, chat-list-panel.html
- [x] Archive button in chat menu — message-list.html:538-541
- [x] Confirmation dialogs — src/components/chat/archive-confirm.html (message-level); chat-level dialog gap-audit 2026-09-23
- [ ] Asset cascade logic — gap-audit 2026-09-23 (archive.ts never touches asset_links; deleteChat does)
- [ ] FEAT-chat-archive-asset-cascade-link-unlink-assets-on-archive-res (issue a77301c) — soft-link/unlink asset_links via archived_at join-column on archive/restore; hard purge hard-deletes
- [ ] Notification on purge — gap-audit 2026-09-23 (archive.ts has no NotificationService call)
- [x] FEAT-chat-archive-purge-notifications-emit-on-archive-restore-pur (issue 39d451a) — emit chat.archived/chat.restored/chat.purged via NotificationService on archive/restore/purge

## Files

- `src/routes/chats.ts` — archive/restore/purge endpoints (extend existing)
- `src/chat/service.ts` — archival business logic
- `src/db/migrations/` — add `archived_at` columns if needed
- `src/frontend/archived.html` — archived chats view (TBD)
- `src/gc/` — retention GC job (TBD)

## Acceptance Criteria

- [x] Archive sets `archived_at` on chat + messages — chat uses is_pinned=PinnedState.Archived (chats/archive-routes.ts); messages use messages.archived_at (routes/messages/archiving.ts:42)
- [x] Restore clears archived state — chat flips is_pinned back to unpinned (archive.ts:73-90); messages clear messages.archived_at (archiving.ts:54)
- [ ] Purge permanently deletes with asset cascade — gap-audit 2026-09-23 (hardDeleteChat cascades but no HTTP route)
- [ ] Retention policy configurable — gap-audit 2026-09-23 (log_retention_days scope mismatch; archiving.ts:94 hardcodes 30 days; spec is 90)
- [ ] GC cleans expired archives daily — gap-audit 2026-09-23 (src/gc/ missing)
- [x] Archived view shows restorable chats — list.ts:129-133; chat-filters.ts archived tab
- [x] Confirmation dialogs for destructive actions — message-level (archive-confirm.html); chat-level dialog gap-audit 2026-09-23
- [x] Tests passing — src/chat/service/crud/archive.test.ts, src/routes/messages/archiving.coverage.test.ts

## Related Epics

- `epic-chat-lifecycle-moderation.md` — chat lifecycle states
- `epic-messages.md` — message model
- `epic-assets.md` — asset cascade
- `epic-logging.md` — audit logging for purge events

## Tickets

- `TASK-archival-workflow.md` — implementation tasks
- `BUG-archive-retention-hardcoded-30-days-should-be-configurable-9` — purge cutoff at src/routes/messages/archiving.ts:94 hardcodes 30 days; spec calls for configurable 90-day default sourced from admin config (issue `0b135d4`).
- `FEAT-chat-archive-gc-job-daily-sweep-of-expired-archives` — daily GC sweep of chats where is_pinned='archived' and updated_at older than archive_retention_days; hard-deletes via hardDeleteChat, writes audit event, registers on cron registry @ 0 3 * * * (issue `69e23ba`).
- `FEAT-chat-archive-retention-config-archive-retention-days-admin-s` — admin-config key `archive_retention_days` (default 90 days); wires purge handler to read from `system_config` instead of hardcoded literal at `src/routes/messages/archiving.ts:94` (issue `ce84227`).
