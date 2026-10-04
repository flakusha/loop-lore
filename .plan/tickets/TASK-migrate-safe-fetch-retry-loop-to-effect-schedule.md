<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Migrate safe-fetch retry loop to Effect Schedule

**Summary:** Re-evaluate the deliberately-deferred safe-fetch retry migration (epic *What was deliberately not migrated*): the epic's objection was routing a `FetchResult`-returning loop through the throwing provider helper; an `Effect.retry` whose failure channel carries the non-ok `FetchResult` avoids that synthesis. Land only on measured net-negative LOC with behavior parity; otherwise record the re-confirmed keep-its-own-loop verdict in the epic.
**Context:** Epic epic-effect-v4-adoption-evaluation. S2 ADOPTED `Schedule` for the provider path; `src/utils/safe-fetch/retry.ts` is the last remaining hand-rolled retry loop. Its extra rules vs the provider loop: returns a `FetchResult` union (with `status`/`headers`) instead of throwing, caller-configurable base delay, and no-retry rules for 4xx / `AbortError` / "timed out".
**Acceptance Criteria:** See ## Acceptance Criteria below — a result-preserving Effect version built beside the loop, LOC measured, parity on every no-retry rule, existing `retry.test.ts` passing unmodified if landed, one of ADOPT/REJECT recorded in the epic's Spike Results table.


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, retry, refactor, evaluation

## Summary

S2 follow-up. The provider path replaced three byte-identical backoff loops with
one `Effect`-backed policy. `src/utils/safe-fetch/retry.ts` repeats the same
backoff expression with a configurable base, so the duplication argument applies
— but the epic deferred it because its shape differs (result union, not throw).
This ticket settles it with a measurement instead of an objection.

## Method

1. Build an `Effect.retry` version in `.tmp/` whose failure channel is the
   non-ok `FetchResult` (no throw synthesis, no unwrapping).
2. Compare against the loop: net LOC, and behavior parity for
   - 4xx → return immediately, no retry
   - `AbortError` / timeout → return immediately
   - capped exponential backoff with caller-configurable base (default 1000 ms, cap 10 s)
   - max-retries-exhausted → last error returned in the union
3. If net-negative LOC and full parity: migrate `retry.ts`, keep
   `retry.test.ts` unmodified as the parity contract.
4. Record ADOPT/REJECT in the epic's *Spike Results* table.

## Acceptance Criteria

- [ ] Result-preserving Effect version measured against the hand-rolled loop (LOC delta recorded)
- [ ] Every no-retry rule (4xx, AbortError, timed out) has a stated parity result
- [ ] If ADOPT: `retry.test.ts` passes unmodified; if REJECT: verdict + reason recorded in the epic
- [ ] Epic *Spike Results* table gains the row

## Files

- `src/utils/safe-fetch/retry.ts` — the migration target (only if ADOPT)
- `src/utils/safe-fetch/retry.test.ts` — parity contract, unmodified
- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — Spike Results row

## Dependencies

- Independent of S4/S5 sequencing, but its verdict feeds S5.

**Resolved:** 2026-10-04 registry-driven close: git issue 0c6e279 (registry tip: 897ecebb8 Konstantin Fedotov Close issue)
