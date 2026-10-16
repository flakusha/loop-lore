<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison parameter sweep axis (seed / steps / CFG)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-comparison-fan-out-engine.md`, `TASK-comparison-metric-collection-and-charts.md`, `epic-model-family-presets.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Make seed, steps, and CFG first-class *sweep axes*: instead of hand-authoring N near-identical
variants, declare one axis with its values and let the set expand into the variant grid, keeping every
other parameter held constant.

## Context

Today a comparison set's variants are authored one by one
(`TASK-comparison-set-routes-crud-ownership-validation.md`). A 10-step sweep is 10 hand-written rows
that can silently drift — the exact failure this epic exists to prevent.

Add an axis declaration to the set create/patch payload: `{ axis: "seed" | "steps" | "cfg", values:
number[] }` (optionally several axes at once, cartesian). The route expands it into the variant grid at
write time — a set stores concrete variants, not an unevaluated expression, so the fan-out engine and
the reproducibility snapshot stay trivial. Expansion happens once, server-side, inside the same
transaction as the insert; a client never posts the expanded grid.

Semantics to pin down:

- **seed axis** — every expanded variant gets its own pinned seed; these variants are *not*
  comparable under the same-seed rule (see `TASK-comparison-comparability-validation.md`), so a
  seed sweep must mark them as a sweep series, not a like-for-like comparison.
- **steps / cfg axis** — every expanded variant keeps the set's pinned seed, so a steps/CFG sweep *is*
  comparable.
- Values must be validated: positive, de-duplicated, ordered, and within the same count cap as the
  variant list.

Per-family parameter ranges live in `epic-model-family-presets.md`'s
`configs/templates/workflows/model-families.yaml` (schema + validation constraints + recommendation
presets). That file **does not exist yet** (verified 2026-10-16: `configs/templates/workflows/` holds
only `defaults.yaml`, `entities.yaml`, `entity-types.yaml`) and the epic is `Not Started`. This ticket
must NOT depend on it — validate against the provider ranges it can actually check today, and pick up
family ranges as a follow-up when that config lands.

## Acceptance Criteria

- [ ] `POST /api/comparison-sets` accepts `axis`/`values` and expands them into the variant grid server-side in one transaction
- [ ] A client posting the same expanded grid explicitly and posting the axis declaration produce byte-identical variant rows (same order, same `position`)
- [ ] A seed sweep marks its variants as a sweep series (not comparable under the same-seed rule); a steps or cfg sweep keeps them comparable
- [ ] A seed axis with 5 values yields 5 variants all pinned to distinct seeds; a steps axis with 5 values yields 5 variants all sharing the set's pinned seed
- [ ] Non-positive, duplicate, or over-cap axis values return 400 naming the offending values
- [ ] Two simultaneous axes expand cartesian and the count cap still applies
- [ ] `src/routes/comparison-sets.test.ts` gains cases for seed sweep, steps sweep, cfg sweep, cartesian expansion, and the four validation rejections
