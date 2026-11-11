<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: backup/restore before 1.0.0 (required, unstarted)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Required claims data resilience but epic-database-backup-recovery.md and epic-db-asset-snapshot-recovery.md are both Not Started -- the biggest Required-vs-plan mismatch. Scope: minimal backup/restore slice shippable for 1.0.0. Related: epic-database-backup-recovery.md, epic-db-asset-snapshot-recovery.md. Caveats: TOCTOU: backup is a point-in-time snapshot; concurrent writes after snapshot excluded and noted. Security: backups inherit at-rest encryption; restore validates integrity before applying. Authorization: backup/restore gated to operator role. Parallelism: single backup/restore flow; concurrent runs serialized. Partial failure: failed restore leaves live data untouched. Rollback: restore is itself the rollback path; pre-restore snapshot taken. Observability: backup/restore runs logged with outcome.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
