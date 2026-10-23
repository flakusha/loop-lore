<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: relationship duplicate guard runs before txn: concurrent same-pair creates can double-insert

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-relationships
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

relationship-create-txn-fix wraps forward+reverse inserts in a txn, but the duplicate guard getRelationship (relationships-service/write.ts:35) still runs BEFORE the transaction, so two concurrent creates of the same pair can both pass the check and double-insert. Pre-existing, not closed by the txn branches. Under Kysely/bun:sqlite single-connection serialization, moving the read inside the txn would close it.

Evidence: minimal-b nit with race analysis.

Affected: src/characters/services/relationships-service/write.ts:35.

Fix direction: move the duplicate read inside the transaction (or add a unique guard the txn can rely on); pin with a concurrent-create test asserting a single row.

Acceptance Criteria:

- [ ] concurrent same-pair creates yield exactly one relationship pair
- [ ] relationships-service suite green

Report: .tmp/glm-review/2026-10-21/minimal-b.md (relationship-create-txn-fix).

Caveats: data race under concurrency; idempotency of create; partial failure must roll back; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
