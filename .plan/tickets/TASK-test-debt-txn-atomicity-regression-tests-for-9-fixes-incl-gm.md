<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test debt: txn/atomicity regression tests for 9 fixes (incl gm-shadow concurrent reveal)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-testing-qa
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Nine txn/atomicity fixes land with no rollback/atomicity/concurrency regression test; every scoped suite is green on dev too (nothing pinned). Per minimal-b standard this is BLOCKING per branch; consolidated here as one test-debt ticket with per-file specs from the reports. Underlying fix branches map to BUG-MOOD-AND-RELATIONSHIP (07b0fee), BUG-GM-SHADOW-NOTE (2b495f0), BUG-ACCEPTRESPONSE (8af2b9a), all Not Started.

Specs:

1. relationships-service.test.ts: bidirectional create asserts 2 rows; failure case (FK violation on reverse) asserts 0 rows. Update: bidirectional update asserts both rows changed + failure asserts neither changed. Delete: happy path asserts BOTH rows gone; failure seam asserts forward row survives.
2. rpg/achievements/service.test.ts: progress-deleted but definition-delete-fails case asserts progress restored (extends :152-173 happy path).
3. mood-service.test.ts: force applyHappinessDelta to throw (delete mood row first: Mood not found) and assert mood_events has no row.
4. gm-notes.test.ts: two concurrent POST reveal with different revealedTo via Promise.all; assert final revealed_to contains all ids. V3 note: this test also settles whether Kysely/bun:sqlite serializes txns on the single connection; if it flakes, the concurrency claim needs driver-level proof.
5. game-master.test.ts: drop the turn row with valid events pending; assert timeline has no new events.
6. turn-manager.test.ts: CAS-retry where a concurrent writer changes participants between snapshot and commit asserts post-commit candidate set; concurrent decrementInitiative for same actor asserts exactly one decrement (extends :357).
7. social morale tests: failed taunt / at-cap rally leaves modifiers empty and lastUpdated untouched.

Evidence: minimal-b per-branch findings, all run-evidenced (9/21/12/19/30/73/18 pass respectively).

Acceptance Criteria:

- [ ] each spec above added and failing-before verified (red on dev or red with seam)
- [ ] full scoped suites green with the fix branches applied

Report: .tmp/glm-review/2026-10-21/minimal-b.md.

Caveats: test-only; failure seams must not leak into production; concurrency tests must be deterministic enough for CI; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
