<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: addLootEntry accepts negative weights, silently corrupting the loot distribution

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/rpg/service/loot-tables.ts (~lines 61-97): negative weight is persisted and added into loot_tables.total_weight. With entry weights [10, -5] the walk total recomputes to 5, so the weighted walk always resolves on the first entry and the second is unreachable — distribution silently corrupted. Expected: reject weight < 0 (or clamp to 0) in addLootEntry. Evidence: skipped test "negative entry weights are rejected" in src/rpg/service/loot-tables.edge-cases.test.ts, branch edge-case-tests-20261101, commit e0d071c5c (edge-case sweep 2026-11-01).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
