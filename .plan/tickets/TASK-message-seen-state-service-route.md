<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Seen-State Service & Route

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Labels:** messages, api, seen
**Epic:** epic-message-seen-state

## Summary

Expose seen-state over the API, reusing the reactions route pattern and `checkChatAccess`. Returns the per-actor viewership ledger (who has seen / who is processing) and lets callers mark seen.

## Current State

- `src/routes/message-reactions.ts` defines `resolveMessageAccess(database, messageId, userId, userRole)` which loads `chat_id` and delegates to `checkChatAccess` (`src/chat/service.ts`), returning 404 on denial. All reaction endpoints reuse it.
- Reactions are keyed by `user_id`; the seen ledger is keyed by `actor_id`. A human caller's `actor_id` is resolved from `chat_participants` where `user_id = userId AND chat_id = msg.chat_id`.

## Change

New `src/routes/message-seen.ts` exporting `messageSeenRoutes(opts, prefix = "/api")`:

- `GET /api/messages/:id/seen` — grouped viewer list:
  ```ts
  Array<{ actor_id, actor_type: "user" | "character", display_name, state, seen_at }>
  ```
  Joined from `message_seen` → `actors` (and `chat_participants` for display name). This is the "who actually seen the message" report.
- `POST /api/messages/:id/seen` — mark the caller's actor seen. Body `{ state?: "seen" | "processing" }`; `processing` only permitted when the caller is a non-human/system actor (the turn scheduler), not a human user. Resolves caller `actor_id` from `chat_participants`; inserts/updates the `message_seen` row, sets `seen_at` on first non-`unseen` transition.
- `DELETE /api/messages/:id/seen` — reset caller's actor row to `unseen` (clear `seen_at`).
- Reuse `resolveMessageAccess` logic (or import the shared helper) so access policy stays identical to reactions.

## Acceptance Criteria

- [ ] All endpoints gate via `checkChatAccess` (404 on missing message / no access) — identical policy to reactions.
- [ ] `GET` returns correct grouped viewer list with `actor_type`, `state`, `seen_at`.
- [ ] `POST` by a human sets `seen`; `processing` is rejected for human callers.
- [ ] `DELETE` resets to `unseen` and clears `seen_at`.
- [ ] `bun test src/routes/message-seen.test.ts` passes (mirror `message-reactions.test.ts` coverage: access denial, grouped list, toggle, unique constraints).
- [ ] `bun run check` green (typecheck + lint + schemas gate).
