<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Crafting & economy slash interactions (/craft /barter /evaluate /trade /repair /appraise)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-crafting-professions

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Crafting & Economy category of the expanded interaction catalog: managing resources and creating value. Depends on `TASK-interaction-service-foundation` (material dependency gate).

## Scope

- `/craft` — combine raw materials into items (requires kit/tools; builds on shipped item crafting system — see FEAT-item-crafting-system, resolved on dev, and EPIC-036 crafting stations).
- `/barter` — negotiate better price (Charisma); `/evaluate` — market value/rarity (Intellect); `/appraise` — quality/enchantment level (Intelligence/Knowledge).
- `/trade` — exchange items/currency with merchant or NPC (EPIC-044 economy flows).
- `/repair` — fix worn/broken gear using materials; ties into item durability where present.

## Acceptance Criteria

- [ ] All 6 verbs registered; skill matrix entries (Charisma/Intelligence)
- [ ] Resource gate blocks `/craft`/`/repair` without ingredients/tools — friendly systemMessage
- [ ] `/craft` output lands in inventory with generated metadata
- [ ] `/barter` outcome influenced by relationship/reputation state (social ripple read)
- [ ] Tests: insufficient-materials branch, successful craft/trade round trip

## Linked Epics

- `epic-crafting-professions.md` (EPIC-036)
- `epic-economy-trading.md` (EPIC-044)
