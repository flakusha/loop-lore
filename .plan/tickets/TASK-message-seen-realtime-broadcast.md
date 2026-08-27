<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Seen-State Realtime Broadcast (WebSocket)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Labels:** realtime, transport, seen
**Epic:** epic-message-seen-state

## Summary

Broadcast seen-state mutations over the WebSocket transport so indicators update live without polling.

## Current State

- `src/transport/` is the WebSocket transport layer. Reactions currently do not have a documented realtime push in the investigated routes; this ticket establishes the seen-channel pattern that reactions can later adopt.
- Seen mutations originate in `src/routes/message-seen.ts` (POST/DELETE).

## Change

- On any `message_seen` insert/update/delete, emit a `message:seen` event to all `chat_participants` of the affected message's chat (scoped by `checkChatAccess` membership).
- Payload: `{ message_id, actor_id, state, seen_at }`.
- Clients subscribe per chat; the frontend (`TASK-message-seen-indicator-frontend`) updates the indicator + viewer list on receipt.
- Reuse the existing transport subscription/scope primitives; do not invent a new socket.

## Acceptance Criteria

- [ ] `message:seen` events delivered to chat participants on POST/DELETE.
- [ ] Event scoped to chat members (no cross-chat leakage).
- [ ] Frontend indicator updates live on event (covered by chat-messages test or a transport test).
- [ ] `bun run check` green.
