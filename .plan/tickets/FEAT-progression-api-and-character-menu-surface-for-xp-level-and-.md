<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Progression API and character menu surface for XP, level, and stats in world

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** character-xp-leveling

**Summary:**

Expose progression state in world context: current level, xp, xp_to_next, pending ASI points, recent `xp_ledger` entries (`GET /api/rpg/xp/history` exists), and stat block with modifiers (`src/rpg/stats/modifiers.ts`) through the character/impersonation panel used in chat/world scenes, plus actions to allocate points and resolve pending level-ups from the sibling tickets. Endpoint set is small extensions of `src/routes/rpg/` (`xp-loot.ts:40` + a stats route); UI follows the existing battle panel pattern (`src/frontend/battle/panel.ts` + Alpine chat-actions dispatch).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
