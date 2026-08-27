<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Message Seen-State & Viewership Ledger

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** messages, seen, read-receipt, viewership, realtime, group-chat, turning, moderation

## Summary

Add a per-message "seen / not-seen" indication and a viewership ledger that records **which actors** (human users, AI characters, and any other chat participants) have seen a message — and, for AI actors, whether they have **begun processing** it under the turn scheduler's rate-limit / batch-planning constraints.

This is distinct from reactions (human-only, emoji) and from message quality scoring (a content property, not a per-recipient state). It is a first-class, per-`actor_id` interaction table mirroring the `message_reactions` pattern but widened to cover non-human participants.

## Scope

- **Schema**: new `message_seen` table keyed by `(message_id, actor_id)` with a `state` column + `seen_at` timestamp; `MessageSeenState` state machine added to `src/db/enums-core/flags.ts` (mirroring `NotificationStatus`).
- **Service / API**: `GET`/`POST` (and optional `DELETE`) seen endpoints reusing `checkChatAccess` from `src/chat/service.ts`, returning a grouped viewer list (who has seen / who is processing).
- **Realtime**: broadcast seen-state changes over the WebSocket transport (`src/transport/`) so indicators update live.
- **Frontend**: seen/unseen indicator on message bubbles + a viewer-list popover (mirrors reaction chips / quick-picker in `message-list.html`).
- **AI processing integration**: hook the turn scheduler (`src/turning/turn-manager/{lifecycle,state,participants}.ts`) so an AI actor's row moves to `Processing` when admitted to a message (rate-limit/batch planning) and to `Seen` when it responds.

## Integration Analysis (from investigation)

- **Reactions** — `src/db/migrations/009_reactions_pins.ts` + `src/routes/message-reactions.ts`. Canonical per-message interaction table + `checkChatAccess` gate. **Reuse the same access helper and route shape.** Key difference: reactions use `user_id` (humans only); the seen ledger must use `actor_id` (`chat_participants.actor_id`, defined in `src/db/migrations/parts/004_chats_actors.ts`) so AI characters are covered.
- **Response rating / quality report** — `src/story/quality/` scorers (`ScorerContext`, `Scorer`) evaluate generated content at runtime. This is a *content* property, not a per-recipient state. **Keep independent.** If a persisted per-message quality report is later added, store it in `messages.metadata` (migration `042_message_metadata.ts`), keyed by message — never per-viewer. UI may co-display quality beside the seen indicator, but no schema coupling.
- **Complaint / flag support** — No generic "complaint" feature exists. Message complaints are modeled as NSFW/user **flags** (`src/nsfw/moderation-service/flags.ts`, `src/routes/messages/nsfw-user-flag.ts`, enum in `src/db/enums-core/flags.ts`), keyed by actor. The `message_seen` ledger's `actor_id` aligns with those flag references, so moderation can later show "who saw this flagged message". **No schema coupling required now.**

## Related Epics

- `epic-messages.md` — message tree / pipeline (spec: `docs/spec/messages.md`)
- `epic-group-chat.md` — multi-actor chats
- `epic-chat-lifecycle-moderation.md` — moderation / flags
- `epic-api-rate-limiting.md` — rate-limit / batch planning that gates AI processing
- `epic-frontend-backend-integration.md` — chat UI wiring

## Tickets

- `TASK-message-seen-state-schema.md`
- `TASK-message-seen-state-service-route.md`
- `TASK-message-seen-indicator-frontend.md`
- `TASK-message-seen-realtime-broadcast.md`
- `TASK-message-seen-ai-processing-integration.md`
