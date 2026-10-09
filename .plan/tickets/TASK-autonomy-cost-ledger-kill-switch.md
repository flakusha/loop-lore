<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: autonomy-cost-ledger-kill-switch

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive

**Summary:**

Per-actor cost ledger plus global kill switch for the autonomy governor. Open ACs carried from TASK-autonomy-rate-governor-for-llm-actors duplicate: every governed action cost-logged per actor, and a global kill switch that halts all autonomous LLM calls. Autonomy epic scope.

**Context:**

Governor denial was already the default and unlimited-stress was dev-gated; the two open ACs from the rate-governor duplicate were the per-actor ledger and the global halt. Constraint: no new table — `autonomy_budget` rows already answer per-actor spend, so the ledger folds rows instead of migrating. The kill switch is an env flag (`AUTONOMY_KILL_SWITCH`) read fresh per check, engaged between actions with no restart, and checked before the cap path so it beats even unbounded scopes.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Implementation:**

- `src/autonomy/governor/kill-switch.ts` — `AUTONOMY_KILL_SWITCH` flag + `isKillSwitchEngaged()`.
- `src/autonomy/governor/index.ts` (`tryConsume`) — engaged → deny every consume (`ok: false`, `remaining: 0`), before the unbounded path, with no DB write and no counter advance; denial emits `governor.budget.exceeded` with `kill_switch: true`. Flag off → budgets enforced as before.
- `src/autonomy/scheduler/tick.ts` (`tickWorld`) — engaged → skip dispatch before any target runs (`skipped: "kill_switch"`); cursor still advances via `completeTick` so killed worlds reschedule. Flag off → dispatch as today.
- `src/autonomy/scheduler/types.ts` — `TickSkipReason` gains `"kill_switch"`.
- `src/autonomy/governor/ledger.ts` — `spendForActor` sums an actor's in-window consumes across `autonomy_budget` rows (per-limit `counts` + `total`); expired windows and unknown actors read as zero. No migration: rows already carry the data.
- Re-exports in `src/autonomy/index.ts`.
- Dev/stress interplay: `unlimited-stress` stays dev-gated (`UnboundedStressGatedError` in production) and cost-logs when on; the kill switch denies even `cap: null` scopes, so halt wins over unlimited.
- Unchanged paths: BDI/GM/travel/workflow dispatch targets (already behind `tryConsume`), tick-driver order (jitter → governor), `TickSkipReason` closed set untouched otherwise.
- Tests: `governor/kill-switch.test.ts` (default denial, kill deny + no row, unbounded deny), `governor/ledger.test.ts` (totals per actor, isolation, zero unknown, expiry), `scheduler/kill-switch.test.ts` (skip + no consume; flag-off dispatch + row). Follow `src/autonomy/` layout (one feature per file, each <120 lines).
