<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Archival Workflow

**Effort:** Medium
**Summary:** Soft-archive with retention, restore, purge
**Context:** Audit 2026-09-23
**Acceptance Criteria:** Partial — 7 of 13 tasks shipped


**Status:** open
**Priority:** Medium
**Epic:** epic-archival-workflow

## Summary

Implementation tasks for Archival Workflow. See `.plan/epics/epic-archival-workflow.md` for full epic scope.


## Shipped (verified 2026-09-23)

- [x] Archive state column — `src/db/migrations/001_init.ts:1874` (messages.archived_at) + `chats.is_pinned = PinnedState.Archived`
- [x] Archive endpoint — `src/routes/chats/archive-routes.ts` → `src/chat/service/crud/archive.ts`
- [x] Restore endpoint — same files, unarchiveChat
- [x] Archived chats view — filter at `src/routes/chats/list.ts:129-133`, Alpine `chat-filters.ts`, `chat-list-panel.html`
- [x] Archive button in chat menu — `message-list.html:538-541`
- [x] Confirmation dialog (message-level) — `src/components/chat/archive-confirm.html`
- [x] Tests passing — `src/chat/service/crud/archive.test.ts`, `src/routes/messages/archiving.coverage.test.ts`


## Outstanding (gap tickets filed)

- [ ] **Chat-level purge endpoint** — `FEAT-chat-level-purge-route-...` (hardDeleteChat at `src/chat/service/visibility.ts:64-74` has no HTTP route)
- [ ] **Retention policy config** — `FEAT-chat-archive-retention-config-archive-retention-days-admin-s` (need separate `archive_retention_days` admin key; `log_retention_days` is audit-log scope)
- [ ] **Hardcoded 30-day purge** — `BUG-archive-retention-hardcoded-30-days-should-be-configurable-9` (`src/routes/messages/archiving.ts:94` literal; spec is 90-day default)
- [ ] **GC job** — `FEAT-chat-archive-gc-job-daily-sweep-of-expired-archives` (`src/gc/` missing)
- [ ] **Asset cascade on archive/restore** — `FEAT-chat-archive-asset-cascade-link-unlink-assets-on-archive-...` (deleteChat cascades but archive.ts doesn't)
- [ ] **Purge notifications** — `FEAT-chat-archive-purge-notifications-emit-on-archive-restore-pur` (issue 39d451a — NotificationService not called from archive.ts)
- [ ] **Chat-level confirmation dialog** — gap-audit 2026-09-23

## Linked Epics

- `epic-archival-workflow.md` (Tasks + Acceptance Criteria sections updated 2026-09-23)

## Acceptance Criteria

- [x] Archive sets archived_at — partial: chat uses is_pinned; messages uses archived_at
- [x] Restore clears archived state — partial: same dual-mechanism caveat
- [ ] Purge permanently deletes with cascade — tracked by gap ticket
- [ ] Retention policy configurable — tracked by gap ticket + BUG
- [ ] GC cleans expired archives daily — tracked by gap ticket
- [x] Archived view shows restorable chats — list.ts filter
- [x] Confirmation dialog — message-level only; chat-level gap
- [x] Tests passing — archive.test.ts + archiving.coverage.test.ts
