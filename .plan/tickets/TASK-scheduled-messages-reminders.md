<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Scheduled messages + reminders

**Epic:** epic-chat-composer-flows.md (proposed)
**Type:** Feature | **Priority:** Medium | **Effort:** M

## Problem
Zero scheduled-send/reminder implementation (grep: only admin/blog).
BUG-chat-quiet-hours-boundary shows quiet-hours logic exists but no
scheduled delivery to gate. Common messenger expectation.

## Change
- `scheduled_messages { id, chat_id, author_id, body, send_at, status }` as new top-level `NNN_*.ts` migration (never parts/ — 001_init frozen); ask append-vs-fold per AGENTS.md, then `bun run db:sync-types && bun run db:sync-manifest`, `bun run schemas:check` +
  cron-adjacent worker reusing `src/cron/` pattern; deliver via existing
  `chat/service/write.ts`; respect quiet-hours (hold, don't drop).
- Reminders: `message_reminders { message_id, user_id, remind_at }` fired
  through `NotificationService` (existing seam).
- Alpine: schedule picker in composer, reminder item in message menu.

## Acceptance
- Scheduled send delivers within 1min window; quiet-hours holds.
- Reminder fires notification; past-due schedules send immediately.

## Non-goals
- Full cron UI (epic-cron-scheduler owns recurrence infra).
