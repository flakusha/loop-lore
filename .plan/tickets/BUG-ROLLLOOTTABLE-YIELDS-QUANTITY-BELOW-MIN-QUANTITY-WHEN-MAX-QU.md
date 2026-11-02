<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: rollLootTable yields quantity below min_quantity when max_quantity < min_quantity

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/rpg/service/loot-tables.ts (~lines 146-148): quantity = min + floor(random * (max - min + 1)) goes negative-range for inverted bounds; observed min=5/max=2 → quantities 3..4, BELOW the configured minimum. addLootEntry performs no bounds validation. Expected: clamp the roll into [min, max] or reject inverted bounds in addLootEntry. Evidence: skipped test "inverted min/max quantity stays inside [min, max]" in src/rpg/service/loot-tables.edge-cases.test.ts, branch edge-case-tests-20261101, commit e0d071c5c (edge-case sweep 2026-11-01).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 9f2f175.

git issue: 9f2f175
