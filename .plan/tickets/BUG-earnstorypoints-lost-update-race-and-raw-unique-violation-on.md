<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: earnStoryPoints lost-update race and raw UNIQUE violation on first earn

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-agency-story-points.md
**Tags:** agency-story-points

**Summary:** earnstorypoints lost update race and raw unique violation on
**Context:** Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e).
**Acceptance Criteria:** transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Summary

Context: src/services/agency/story-points/mutations.ts:39-68 (landed 681e6605e). Severity: blocking. SELECT-then-absolute-UPDATE outside a transaction: concurrent earns compute newBalance from a stale read and write it absolutely (earned_total increments relatively → balance drifts from earned−spent invariant). Concurrent first-time earns both take the INSERT branch → second throws raw SQLITE UNIQUE (uq partial index) → 500 from /agency earn. Repro: parallel earnStoryPoints on fresh actor. Fix: transaction with relative UPDATE balance = balance + amount and INSERT ... ON CONFLICT DO NOTHING (020's partial unique index makes the conflict target expressible); keep CapExceeded check inside the txn.

## Acceptance Criteria

- [x] Implementation complete. — read-decide-write wrapped in one transaction; INSERT is `ON CONFLICT DO NOTHING` against the matching 020 partial index; UPDATE is relative (`balance = balance + ?`) with the cap re-applied in-statement; CapExceededError check moved inside the transaction.
- [x] Tests passing. — `src/services/agency/story-points.test.ts` 20 pass / 0 fail, including three new concurrency tests. Reproduced before the fix: 7 of 8 parallel first-time earns rejected with `UNIQUE constraint failed: actor_story_points.actor_id`, and 10 parallel earns of 3 over a seed of 10 left `earned_total` at 40 with `balance` at 13.
- [x] Documentation updated. — the `earnStoryPoints` JSDoc records the concurrency contract and the `@throws` the function can now raise.


## Scope found during review (2026-09-30)

The ticket named only `earnStoryPoints`. A sibling defect in `spendStoryPoints`
was found and fixed with it, because it is the same defect on the same table
against the same 020 partial unique index:

- `spendStoryPoints` used the identical SELECT-then-INSERT shape. Probed before
  the fix: 3 of 4 parallel first-time spends raised a raw
  `SQLiteError: UNIQUE constraint failed: actor_story_points.actor_id` instead of
  `InsufficientStoryPointsError`. All 4 raise the domain error now.
- The `MIN(COALESCE(cap, ...))` clamp in the rewritten earn path was dead code:
  every input it would clamp is an input the cap guard above it intercepts first.
  Removed; the plain relative add is behaviourally identical.
- **Unflagged semantic change:** the old code refused an earn only at full cap
  saturation and silently clamped a partial overflow, leaving `earned_total`
  counting the refused amount. It now refuses any overflow. Probed old vs new to
  confirm the difference is real, and documented it in the JSDoc. Every callsite
  degrades gracefully — there is no HTTP earn route, `/agency earn` catches and
  renders the message, and the achievements path catches and logs.
- One knock-on behaviour change: a refused first-time spend no longer leaves a
  zero row behind (was 1, now 0), because the transaction rolls back with the
  failed debit. The row was a phantom and the GET path already treats a missing
  row as zero, so the observable balance is unchanged.

Suite is 31 pass / 0 fail. The 6 new cap tests and 4 new spend tests were run
against the pre-fix code and fail there.
