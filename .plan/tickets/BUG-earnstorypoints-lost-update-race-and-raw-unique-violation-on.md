<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: earnStoryPoints lost-update race and raw UNIQUE violation on first earn

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** earnstorypoints lost update race and raw unique violation on
**Context:** Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e).
**Acceptance Criteria:** transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Summary

Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e). Severity: blocking. SELECT-then-absolute-UPDATE outside a transaction: concurrent earns compute newBalance from a stale read and write it absolutely (earned_total increments relatively → balance drifts from earned−spent invariant). Concurrent first-time earns both take the INSERT branch → second throws raw SQLITE UNIQUE (uq partial index) → 500 from /agency earn. Repro: parallel earnStoryPoints on fresh actor. Fix: transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Acceptance Criteria

- [x] Implementation complete. — read-decide-write wrapped in one transaction; INSERT is `ON CONFLICT DO NOTHING` against the matching 020 partial index; UPDATE is relative (`balance = balance + ?`) with the cap re-applied in-statement; CapExceededError check moved inside the transaction.
- [x] Tests passing. — `src/services/agency/story-points.test.ts` 20 pass / 0 fail, including three new concurrency tests. Reproduced before the fix: 7 of 8 parallel first-time earns rejected with `UNIQUE constraint failed: actor_story_points.actor_id`, and 10 parallel earns of 3 over a seed of 10 left `earned_total` at 40 with `balance` at 13.
- [x] Documentation updated. — the `earnStoryPoints` JSDoc records the concurrency contract and the `@throws` the function can now raise.
