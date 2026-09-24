<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message polls / votes

**Status:** open
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement.md (proposed)
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
