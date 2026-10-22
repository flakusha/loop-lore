<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Dead-code guard in advancePartyTravel

**Status:** Done
**Status Note:** the guard is NOT dead code and was kept. `steps_per_tick` is a REAL column and `travel_progress` is a REAL column, so a carry below the ULP of the stored progress rounds away: `0.5 + 1e-17 === 0.5` in IEEE-754, and `step.progress === party.travel_progress` holds. `src/rpg/world-travel/travel.ts:189-196` now says so in a comment and states the condition as `<=` ("the carry did not grow"); deleting the guard would bill the world every tick for distance no party ever covered.
**Priority:** low
**Effort:** Medium
**Caveats:** data races — none (the guard runs before the charge, so a party that advanced nothing is never billed); partial failure — a party whose carry rounds away stays where it is forever and is never charged, which is the intended behaviour; observability — the ledger stays unopened for such a party, so a world of them looks idle rather than budget-starved

**Summary:**

The condition at src/rpg/world-travel/travel.ts:192 (if step.edges === 0 && step.progress === party.travel_progress) can never be true. walk() computes progress = party.travel_progress + party.steps_per_tick, and line 177 guarantees steps_per_tick > 0, so step.progress > party.travel_progress always. Impact: None at runtime but misleads readers. Fix: Delete the condition or replace with a comment.

**Context:**

The ticket's premise is that `step.progress > party.travel_progress` always, which is true in exact arithmetic but not in IEEE-754. `travel_progress` and `steps_per_tick` are REAL columns, so a party whose speed is below the ULP of its stored carry rounds back to the same value: `0.5 + 1e-17 === 0.5`. The guard then fires and the party is neither charged nor moved.

That makes the guard load-bearing, not misleading: deleting it (the ticket's first option) lets the party fall through to `chargeBudget`, so the world budget is drained every tick by a party that never covers any distance. The second option — a comment — is what was done, and the condition was restated as `<=` so it reads as the intent ("the carry did not grow") rather than as an equality that looks unreachable.

Alternatives rejected: deleting the condition (it would bill the world for distance never covered); rounding the carry explicitly in `walk()` (that changes the speed semantics of every party, not just the degenerate one); rejecting a `steps_per_tick` below the ULP at insert time (a data-validation change in another module, and the guard already handles it safely).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- `src/rpg/world-travel/travel.ts:189-196`: the guard keeps its behaviour, gains a comment that says when it fires and why, and is stated as `step.progress <= party.travel_progress`.
- `src/rpg/world-travel/travel.test.ts`: new case "a step too small to change the stored carry is not charged" — a party at `travel_progress = 0.5` with `steps_per_tick = 1e-17` reports no action, keeps its carry, and never opens the budget ledger. Verified as a genuine witness: with the guard deleted the same test fails (the party is charged and reports a `party_step`).

**Resolved:** 2026-10-22 registry-driven close: git issue cbcacc6 (registry tip: 66fca2222 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-DEAD-CODE-GUARD-IN-ADVANCEPA)
