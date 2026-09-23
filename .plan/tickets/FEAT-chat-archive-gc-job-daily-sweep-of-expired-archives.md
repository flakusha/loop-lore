<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Chat archive GC job — daily sweep of expired archives

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Add a daily GC job at 03:00 UTC that hard-deletes chats archived longer than the configured `archive_retention_days`, with an audit log entry.
**Context:** gap-audit 2026-09-23 of `epic-archival-workflow` found no GC job exists; `src/gc/` is missing and `epic-cron-scheduler.md` defines the scheduling pattern this job should plug into; the spec requires a daily sweep that hard-deletes expired archives.
**Acceptance Criteria:** Job runs daily at 03:00 UTC; finds chats with `is_pinned=archived` older than `archive_retention_days`; hard-deletes them; emits an audit event; registered with the existing cron scheduler.

## Summary

## What

gap-audit (2026-09-23): no GC job exists for the chat-archive retention sweep. The spec calls for a daily sweep at 03:00 UTC that hard-deletes chats whose archived_at is older than the configured retention window and emits an audit event.

## Why

- `src/gc/` is missing entirely today; nothing walks the chats table looking for archived-age violations.
- The spec at `.plan/epics/epic-archival-workflow.md` requires a daily sweep — without it, retention is unenforceable: a chat that no admin ever loads remains in storage forever even past the configured retention window.
- The existing cron scheduler pattern documented in `.plan/epics/epic-cron-scheduler.md` is the canonical registration seam; reuse it rather than introduce a new scheduler.
- Without an audit log entry, we lose the ability to answer "which chats were purged, by whom, when" — a compliance gap.

## Scope

- Create `src/gc/archive-expiration.ts` containing the sweep function. Reads `archive_retention_days` from admin config (default 90).
- Register the job with the existing cron scheduler at 03:00 UTC daily.
- Hard-delete expired archived chats via `hardDeleteChat` (existing path; cascades `asset_links`).
- Emit an audit-log entry per sweep run summarizing chats purged and actor `system:archive-gc`.
- Add unit test verifying that chats older than the retention window are selected and that the audit event is emitted.

## Acceptance Criteria

- Job runs daily at 03:00 UTC via the existing cron scheduler.
- Sweep finds every chat with `is_pinned=archived` whose `archived_at` is older than `archive_retention_days` and hard-deletes them.
- Each sweep run emits an audit-log entry naming the actor as `system:archive-gc` and the count of chats purged.
- Unit test: seeded fixture with mixed-age archived chats → only the expired ones are deleted and the audit event is emitted.
