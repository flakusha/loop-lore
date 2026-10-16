<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison reproducibility — seed/parameter lock and exact re-run

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-variant-data-model.md`, `TASK-comparison-fan-out-engine.md`, `TASK-comparison-parameter-sweep-axis.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Guarantee the epic's central promise: same set + same seed + same parameters ⇒ re-runnable. Provide a
parameter lock, a re-run endpoint that snapshots the variant parameters into a new run, and a
comparable report proving the two runs used identical inputs.

## Context

The `locked` column does **not** exist yet. It is a to-be-created column on
`comparison_set_variants`, owned by `TASK-comparison-set-variant-data-model.md` (Not Started); this
ticket's lock semantics are defined against that DDL and require the migration to land first. A locked
variant has its generation parameters frozen:
`PATCH /api/comparison-sets/:id` may change its title/position but must reject a change to `seed`,
`steps`, `cfg`, `sampler`, `scheduler`, `width`, `height`, `lora_stack`, `reference_set`,
`edit_mask_asset_id`, or `backend` while `locked = 1`. Unlocking is an explicit call, not a side
effect of editing.

Re-run writes a `comparison_set_runs` row plus a snapshot of each variant's parameters *at dispatch
time*, so a later edit to the set cannot rewrite history for an already-landed run. The fan-out engine
(`src/comparisons/fan-out.ts`, `TASK-comparison-fan-out-engine.md`) reads the snapshot, not the live
variant row, when a run id is supplied.

An unpinned seed (`seed IS NULL`) is legitimate but not reproducible: a re-run of such a variant must
record `reproducible: false` rather than silently substituting a seed. Substituting one would be
worse than useless — it would make a non-reproducible run look reproducible in the report.

Re-run must not delete or mutate the prior run's asset links; outputs of run N and run N+1 coexist and
are distinguished by run id in the cell detail view.

**Ownership boundary with `TASK-cross-model-comparison-run-data-side.md`** (that ticket,
`epic-reference-conditioned-generation`, is also Not Started). Run identity for a **comparison set** —
the `comparison_set_runs` row, the per-variant parameter snapshot, the `reproducible` verdict, and
`POST /api/comparison-sets/:id/rerun` — is owned here. Run identity for a **cross-model reference run**
— one pinned prompt + ordered reference set + seed shared across the four target model families, with
a skipped row for any family its capability row excludes — is owned by that ticket. Both tickets
implement the same-prompt identity in their own tables; neither may create the other's. The join key
between them is that shared prompt identity plus the per-model result row that ticket produces.

## Acceptance Criteria

- [ ] Patching a locked variant's `seed`, `steps`, `cfg`, `sampler`, `scheduler`, `width`, `height`, `lora_stack`, `reference_set`, `edit_mask_asset_id`, or `backend` returns 400 naming the frozen fields; `title` and `position` still patch
- [ ] `POST /api/comparison-sets/:id/rerun` creates a new `comparison_set_runs` row and a per-variant parameter snapshot
- [ ] Fan-out dispatch for a run reads the snapshot, not the live variant row (proved by a test that edits the set after the run starts)
- [ ] A re-run of a set with every variant pinned to the same seed reports `reproducible: true`; a re-run with any `seed IS NULL` reports `reproducible: false` and does not invent a seed
- [ ] The prior run's rows and asset links are unchanged after a re-run; both runs are readable
- [ ] `src/comparisons/rerun.test.ts` covers the locked-field rejection, snapshot-vs-live dispatch, the pinned and unpinned reproducibility verdicts, and prior-run immutability
