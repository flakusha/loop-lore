<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Denied/abandoned battle trigger: world/character/NPC interaction handling

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Follow-up to D2-B. Today the denial reply IS the whole guard (decision D2-A): no state is written, no bookkeeping. Design the correct handling of world/character/NPC interactions when a battle trigger is denied or abandoned: standings/reputation effects, NPC awareness or cleanup, party notification, audit trail. Must stay consistent with the best-effort bookkeeping contract (never fail resolution on bookkeeping).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue f340961.

git issue: f340961
