<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Scheduled messages + reminders

**Status:** Done
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-composer-flows.md
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

**Resolved:** 2026-10-03 registry-driven close: git issue 2afc68e (registry tip: bb20277a7 Konstantin Fedotov Close issue)

## Implementation (2026-10-03, worktree chat-composer-flows)

Migration `032_scheduled_messages_reminders.ts` adds `scheduled_messages`
(id/chat_id/author_id/body/send_at/status) and `message_reminders`
(id/message_id/user_id/remind_at) with cascade FKs, an `(status, send_at)`
due index, a `(message_id, user_id)` unique index, and a `remind_at` due
index. Append-only after 031; derived schema regenerated with
`db:sync-types` + `db:sync-manifest`.

Service layer `src/chat/scheduled/` (barrel re-exports; the dispatcher is
the cron seam): `scheduled-messages.ts` (create/list/cancel plus the due
select and the guarded sent-mark), `reminders.ts` (create/list/cancel plus
due select and fired-delete), `dispatcher.ts` (`dispatchDue` — one pass
that delivers due rows and fires due reminders), `types.ts`.

Routes `src/routes/scheduled/index.ts` (guards and the service-error
mapping split to `guards.ts` so the handler bodies stay under the 250L
strict size limit):
`POST|GET /api/chats/:id/scheduled`, `DELETE /api/chats/:id/scheduled/:scheduledId`,
`POST|GET /api/reminders`, `DELETE /api/reminders/:id`. The chat param is
`:id`, matching every other `chats/*` route — memoirist rejects a
differing param name at an already-registered path, so `:chatId` broke
the whole v1 barrel. Mounted twice on purpose: unversioned `/api` from
`register-plugins.ts` (next to `proactiveMessagingRoutes`) and
`/api/v1` via `routes/v1/chats-surface.ts`, because the Alpine actions
call `/api/v1/...`. Chat-scoped endpoints gate
on `checkChatAccess` and answer 404 on denial (codebase convention hides
chat existence — same as the read paths). The reminder endpoints are
user-scoped, and the arm path resolves the message's own chat so access
is never checked against a body-supplied id.

Cron: `chat.scheduled` added to the existing `defaultJobs()` catalog at
`* * * * *` so a due message lands inside the ticket's 1min window.
Delivery goes through the existing message write path
(`insertUserMessageWithRetry`), the same helper the create route uses.

Quiet hours reuse `isInQuietHours` from `src/chat/proactive/timing.ts` —
no second helper. A row due inside the window is HELD (left `pending`,
`send_at` untouched) and goes out on the first pass after the boundary;
nothing is dropped.

Dispatch isolates per-row failures: each due scheduled row and each due
reminder is handled inside its own try/catch, so a poison row
(undecryptable body, actor row removed mid-flight, encryption misconfig) is
logged with its id and counted in `DispatchSummary.failed` rather than
aborting the pass. Rows are selected `send_at` ASC, so an uncaught throw
would have put the same row first on every future tick and starved every
later due row. A failed scheduled row stays `pending` and retries on the
next tick; nothing is dropped.

The idempotency key is claimed before the insert: the dispatcher looks the
key up through the existing `findByIdempotencyKey` and, on a hit, marks the
row sent and skips the insert. A crash between a successful insert and
`markScheduledSent` therefore self-heals on the next pass instead of
delivering the same message twice. `idx_messages_idempotency` is a plain
index rather than a unique constraint and the shared insert helper does not
dedupe, so the claim lives in the dispatcher rather than in that helper.

Alpine: one `chat-actions/scheduling.ts` module carrying both halves —
the composer clock button + `datetime-local` picker (state in
`chat-types/scheduled-state.ts`, markup in `components/chat/input-area.html`)
and the message-context-menu reminder item on a 10min/1h/1day ladder
(state in `chat-types/reminder-state.ts`, markup in
`components/chat/message-list.html`). They ship together because they
share the endpoints, the toast surface and the load-on-open lifecycle.
Locale keys added to `en.json` and reconciled across all 10 locales.

The `noActiveChat` toast-and-bail guard was extracted to
`src/frontend/alpine/chat-guards.ts` (`requireActiveChat`, a type predicate
so callers keep the same `activeChat: string` narrowing) and adopted at all
9 same-key sites across `chat-actions/` and the chat root modules. The
jscpd ratchet is one-way — the baseline can only be lowered, never raised —
so a feature that merely repeats a copy-pasted guard would be permanently
unlandable. `gif-picker.ts` (`gifPicker.noActiveChat`) and
`chat-generations.ts` (`toasts.noActiveChatToCancel`) use different keys and
were left untouched.

Tests: dispatcher boundaries (due sends, not-yet-due stays pending,
quiet-hours hold then delivery past the boundary, canceled never sends,
no double-delivery, a poison row failing without starving the rows behind
it, a crash between insert and status-update not delivering twice, reminder
fires exactly once, not-yet-due reminder stays armed, re-arm replaces) plus
route contract (401 unauth, 404 for a
non-participant rather than 403, author-only cancel, empty/unparseable
input 400s, caller-scoped reminder list and cancel) and the picker's
datetime-local conversion and guard clauses.

Deviations from the ticket:

- Reminder horizons in the context menu are a fixed 10min/1h/1day ladder
  rather than a free-form instant — the menu has no room for a datetime
  input; free-form scheduling lives in the composer picker.
- Delivery routes through `prepareContentStorage` in `dispatcher.ts`, so a
  chat with `encryptAtRest` persists an encrypted scheduled body exactly
  as an interactively-typed message would; the parked row itself stays
  plaintext in `scheduled_messages.body` until the dispatch pass stores
  it. Covered by the at-rest encryption test in `scheduled.test.ts`.
- `sendAt` in the past is accepted by design (AC2 past-due sends
  immediately) rather than rejected as a validation error.
