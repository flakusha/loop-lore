<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Progression API and character menu surface for XP, level, and stats in world

**Status:** Done
**Status Note:** REST routes shipped on dev — `POST /api/rpg/progression/:actorId/award` :141, `/asi` :170, `/level-up` :199 in `src/routes/rpg/progression.ts`; blocked on sibling F2 character-menu/panel buttons (tree `xp-progression-surface`, unlanded); verified 2026-10-23
**Priority:** high
**Effort:** Medium
**Caveats:** observability — the routes are live but undiscoverable in-world until the panel buttons land; no frontend consumer on dev
**Epic:** epic-character-xp-leveling
**Related:** .plan/tickets/TASK-wire-xp-loot-routes.md (mounted the xp-loot route surface this extends), .plan/tickets/FEAT-level-up-decision-interface-for-autonomous-llm-actors-with-a.md (exposes the level-up/allocate resolution actions), .plan/epics/epic-character-world-integration.md (character/impersonation panel in world scenes reads the stat block this surfaces)

**Summary:**

Expose progression state in world context: current level, xp, xp_to_next, pending ASI points, recent `xp_ledger` entries (`GET /api/rpg/xp/history` exists), and stat block with modifiers (`src/rpg/stats/modifiers.ts`) through the character/impersonation panel used in chat/world scenes, plus actions to allocate points and resolve pending level-ups from the sibling tickets. Endpoint set is small extensions of `src/routes/rpg/` (`xp-loot.ts:40` + a stats route); UI follows the existing battle panel pattern (`src/frontend/battle/panel.ts` + Alpine chat-actions dispatch).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue a300746 (registry tip: a7814a064 Konstantin Fedotov Close issue)
