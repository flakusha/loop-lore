<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG silent catches and dice modular bias

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-resolution-system

**Summary:**

Three small defects.

- src/rpg/reproduction/index.ts:139-144 — getHeatEffects catches and defaults fertility to 1, so a DB error or a logic bug in the heat-cycle system is indistinguishable from a genuinely absent effect.
- src/rpg/crafting/discovery.ts:169-171 — an empty catch swallows a logger initialisation failure with no log.
- src/rpg/dice/roll.ts:18-22 — cryptoRandomInt returns (array[0]! % max) + 1. For a max that does not divide 2^32 the residues are uneven; the worst case is roughly 2^-28 for d100. Negligible for a game, but rejection sampling is a three-line change if dice fairness is ever claimed.

Source: .tmp/longcat/review-assets-db-frontend.md N18, N19, N31.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
