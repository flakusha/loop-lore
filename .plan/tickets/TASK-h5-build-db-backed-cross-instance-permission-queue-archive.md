<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: H5 build: DB-backed cross-instance permission queue + archive

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Design is complete (`.tmp/research/wave4-h4h5-design.md`, Candidate A). Add `harness_permission_asks` + `harness_permission_asks_archive` tables via a migration placed AFTER the sibling H16 migration (next free `NNN` at implementation time — never renumber theirs); add a NEW `permission-store.ts` storage seam; `PermissionQueue` takes an optional store (absent store = today's in-memory behavior, so the existing tests stay green unmodified); wire the store in `runtime.ts:200`; the admin permissions read path serves the cross-instance listing. Owner-only wire delivery is preserved.

**Context:**

- Ordering: `TASK-harness-budget-prognosis-and-execution-order.md` rank 6, judgment-class — good-worker-only, never a fast worker.
- Migration sequence: after `BUG-harness-queue-boot-recovery-fails-other-instances-inflight-t.md` (H16); take the next free `NNN`, never renumber theirs.
- Ownership rule: only the origin instance delivers to the wire; a peer decision writes the `decision` column (conditional update — the H1 affected-rows claim idiom), the owner applies it and archives.
- `PermissionQueue` keeps its exact public surface (`submit` / `resolve` / `listPending` / `pendingCount` / `withdrawProfile` / `idle`).
- Epic: `epic-harness-integration.md` (Status Not Started).

**Related:**

- `.tmp/research/wave4-h4h5-design.md` (H5 section, Candidate A)
- `TASK-harness-budget-prognosis-and-execution-order.md` (rank 6, judgment-class)
- `BUG-harness-queue-boot-recovery-fails-other-instances-inflight-t.md` (H16 — migration must land first)
- honkbox: no direct analogue (honkbox has no cross-instance permission queue; `TASK-loop-lore-provider-smoke.md` (Status: proposed) is the nearest — "one side owns GPU admission, never both")

**Acceptance Criteria:**

- [ ] `harness_permission_asks` + `harness_permission_asks_archive` exist with a `(profile, arrival)` index; the migration uses the next free `NNN` and does not renumber the sibling H16 migration.
- [ ] NEW `src/integrations/harness/permission-store.ts` exposes the storage seam (`loadPending`, `insertAsk`, `claimDecision`, `archiveResolved`) over a Kysely/sqlite implementation.
- [ ] `PermissionQueue` accepts an optional store; with no store it behaves exactly as today and `permission-queue.test.ts` passes unmodified.
- [ ] `runtime.ts:200` wires the DB store into `new PermissionQueue`.
- [ ] The admin permissions read path serves the cross-instance listing when a store is present.
- [ ] Two instances over one sqlite file: ask parked on A appears in B's pending list; a decision on B produces exactly one wire delivery on A; the decided ask leaves pending and appears in the archive with `decided_by_instance` = B; a restart loses no pending ask.
- [ ] Tests passing, docs updated.
