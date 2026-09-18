<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NPC Retinue Minimal Chat Act Send React Join

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-npcs
**Tags:** npc, retinue, chat

**Summary:**
Enable retinue NPCs to perform minimal acts in chat: send a short message, react with an emote, or auto-join battle when their boss is engaged.

**Context:**
A retinue should not be fully passive. The world-RPG epic batch calls for "minimally act": a loyal guard speaks up, a coerced cultist whispers, a hired blade just stands. Battle join is the aggressive mode.

**Acceptance Criteria:**
- On chat message containing `attack:boss`, retinue flags `defend_on_attack=true` auto-attaches guard as ally in combat.
- On retinue member presence in chat at the same location, allow one emote + one short-message per N messages (rate-limited by `min_chat_act`).
- All retinue actions logged in `chat_events` table for moderation review.
- Tests: trigger attack -> guards enter combat; spam protection prevents over-posting; admin toggle disables retinue acts.
