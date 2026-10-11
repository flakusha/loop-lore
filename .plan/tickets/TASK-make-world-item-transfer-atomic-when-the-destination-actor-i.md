<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Make world-item transfer atomic when the destination actor insert fails

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-inventory

**Summary:**

Found while reconciling `.plan/epics/epic-inventory.md`. Actor-to-actor transfer via `src/services/actor-items/transfer.ts` is atomic, but the world-instance path in `src/story/items/instances.ts` is not equally safe.

`transfer()` at `instances.ts:31-128` decrements the source, then INSERTs the destination row. The destination insert can fail on its own — a bad or non-existent `toActorId` — leaving the source already decremented. `instances.test.ts` covers this by asserting the call rejects, which means the failure is observed as a thrown error rather than as an intact source row.

The function already accepts a `trx` parameter and falls back to `state.db.transaction().execute(run)` at L126-127, so the fix is to make the decrement and the destination insert participate in the SAME transaction rather than only the outer happy path.

Implementation: assert in a test that a failed destination insert leaves the source quantity unchanged. That assertion is the acceptance criterion; the transaction wiring is the fix.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
