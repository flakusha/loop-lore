<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Chat archive purge notifications — emit on archive/restore/purge

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Emit `chat.archived` / `chat.restored` / `chat.purged` notifications to chat participants on archive/restore/purge via the existing NotificationService.
**Context:** Gap-audit of `epic-archival-workflow` (2026-09-23) found that archive/restore/purge mutate state without notifying participants; `NotificationService` already exists with the participant-fanout primitives needed.
**Acceptance Criteria:** Each lifecycle action emits the correct event for all participants except the actor; recipients see immediate in-app rows; preference-unsubscribed users are skipped silently; no new deps and no behavior change for the actor.

## Summary

## What

The chat archive/restore/purge flows in `src/chat/service/crud/archive.ts` perform state changes but never notify participants. Users discover archived or purged chats only by reloading the chat list — there is no in-app notification, no email, no SSE event. The spec calls for notifying participants on purge at minimum, and on archive/restore for parity.

## Why

Audit of 2026-09-23 against `epic-archival-workflow` found that `archiveChat`, `unarchiveChat`, and `hardDeleteChat` (the latter defined at `src/chat/service/visibility.ts:64-74`, but its dispatch from the archive module also lacks notifications) mutate state and return without emitting any event. A `NotificationService` already exists at `src/notifications/` with participant-fanout and unsubscribe primitives; the archive flow simply does not call it. Spec section 4.3 (participant notifications on lifecycle events) is unimplemented.

## Scope

- Touch `src/chat/service/crud/archive.ts` — inject `NotificationService` into the service container, then call it from `archiveChat`, `unarchiveChat`, and from the purge dispatcher with three event types: `chat.archived`, `chat.restored`, `chat.purged`.
- Reuse the existing `NotificationService` API at `src/notifications/` — do not add a new transport; do not add SSE wiring unless the existing service already exposes it (it should).
- Honor user notification preferences: if a participant has unsubscribed from `chat.lifecycle` (or whatever key the service uses), skip silently.
- Notify all chat participants except the actor who triggered the change; actor is already excluded by passing `{ excludeUserId: actorId }`.
- Body of each notification: localized title + chat title + actor display name; reuse existing template helpers if present.
- Do NOT touch `src/chat/service/visibility.ts` except to forward a notification hook if purge routes through it; do NOT modify the existing admin retention config or GC job tickets (separate gaps).
- Do NOT add new dependencies; do NOT introduce a queue or background worker — synchronous fan-out via the existing service is fine for current scale.

## Acceptance Criteria

- `archiveChat` emits `chat.archived` for every participant except the actor; `unarchiveChat` emits `chat.restored`; purge emits `chat.purged`.
- Recipients see the notification in the in-app notification list immediately (synchronous write, no polling).
- Notifications persist to the same store the rest of the app uses (verify by reading the notification row after the action).
- If a participant has unsubscribed from chat-lifecycle notifications, no row is written and no log line is emitted (silent skip, not an error).
- Existing archive/restore/purge behavior is unchanged for the actor and for users with notifications disabled.
- No new dependencies, no new top-level routes, no schema migrations beyond what `NotificationService` already supports.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
