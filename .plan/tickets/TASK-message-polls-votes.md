<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message polls / votes

**Status:** Done
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement
**Type:** Feature | **Priority:** Medium | **Effort:** M

## Problem

No poll implementation (grep `poll` in routes/chat/db: only polling
false positives). Group + RPG party decisions currently happen in prose.

## Change

- `message_polls { message_id, question, options JSON, multi, closes_at }`
  - `poll_votes { poll_id, user_id, option_idx }` as new top-level `NNN_*.ts` migration (001_init frozen; ask append-vs-fold, regen types/manifest, `schemas:check`) +
  modeled on `message_reactions` dedup pattern (confirm UNIQUE in 009_reactions_pins at build time).
- Routes: create/close/vote with `checkChatAccess`; results inline on
  message bubble, optimistic Alpine update (same contract as reactions
  epic: no full re-render).
- Close: author/GM only; closed polls reject votes with 409.

## Acceptance

- Single/multi vote round-trips; double-vote dedups; closed → 409.
- RPG party-vote can reuse poll_id (no second voting system).

**Resolved:** 2026-10-23 registry-driven close: git issue f5b705b (registry tip: 0326479c0 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-MESSAGE-POLLS-VOTES done)

## Resolution

No RPG party-vote implementation existed (`src/rpg/`, `src/battle/` greps
found nothing reusable) — built standalone per the ticket's fallback.

- `src/db/migrations/071_message_polls.ts` — `message_polls` (one per
  message via unique `message_id`) + `poll_votes` with a
  `(poll_id, user_id, option_idx)` unique constraint for dedup;
  generated artifacts regenerated via `db:sync-types`/`db:sync-manifest`.
- `src/chat/service/polls.ts` — createPoll / votePoll / closePoll /
  getMessagePoll / listChatPolls; closed polls reject votes with the new
  `"conflict"` ServiceError code (mapped to 409 in
  `serviceErrorToResponse`).
- `src/routes/message-polls.ts` — create/vote/close/read per message plus
  `GET /api/chats/:id/polls`; mounted in `v1/chats-surface.ts`.
- Frontend: `src/frontend/alpine/chat-polls.ts` (Alpine methods, in-place
  `msg.poll` updates — no full re-render), poll + composer blocks in
  `src/components/chat/message-list.html`, `chats.poll*` i18n keys in all
  10 locales, contract documented in
  `docs/frontend/chat/message-actions.md` (P2 Poll action).
- Tests: `src/chat/service/polls.test.ts` (14),
  `src/routes/message-polls.test.ts` (4),
  `src/frontend/alpine/chat-polls.test.ts` (11).
