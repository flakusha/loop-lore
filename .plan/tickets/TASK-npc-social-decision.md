<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Social Decision

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-npcs.md
**Tags:** npc, social
**Summary:** `should_interact` gate: utility-scored reaction decision (chat / wait / do-other / flee / attack / ignore) reusing the shipped utility scorer weights.

**Context:** Reaction model exists in `src/characters/services/personality-service/utility-scorer.ts` (22 tests green); this ticket wires it as the per-turn social decision for NPC encounters, distinct from `TASK-social-interaction.md` skill checks. Governor budgets apply once `TASK-autonomy-rate-governor` lands.

**Acceptance Criteria:**

- [ ] Decision function unit-tested across modes (chat/wait/flee/attack/ignore).
- [ ] Budgets respected when governor present; safe default deny otherwise.
- [ ] `bun run check` green.
