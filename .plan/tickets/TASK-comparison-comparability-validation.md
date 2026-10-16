<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison comparability validation

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-grid-frontend.md`, `TASK-comparison-parameter-sweep-axis.md`, `TASK-comparison-metric-collection-and-charts.md`, `TASK-comparison-two-cell-diff-modes.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

One shared predicate that decides whether two variants may be compared, aggregates, or charted
together — and makes the UI say so loudly when they may not.

## Context

A comparison chart that silently compares non-comparable cells is worse than no chart, because it
looks authoritative. The rules (from the epic's ## Scope):

1. identical `width` / `height` — aspect mismatch is a hard warning;
2. identical seed **policy** — both pinned to the same integer, or both explicitly unpinned;
   one pinned and one unpinned is non-comparable;
3. identical `reference_set` — same asset ids in the same order;
4. identical sampler/scheduler family when the comparison axis is the model.

This must be **one shared predicate**, not four checks re-implemented in the grid, the diff view, and
the chart — otherwise the three surfaces drift, which is the exact class of bug
`visibleGalleryAssetFilter` in `src/assets/service/read.ts:120` prevents when it factors the gallery
visibility filter so the grid and the search "cannot drift apart" (reasoning at `:111-115`).

Returns a verdict, not a boolean: `{ comparable, reasons: string[] }`, where `reasons` names the
violated rules so the UI can badge them. Consumers:

- the grid (`TASK-comparison-grid-frontend.md`) renders the badge;
- the diff view (`TASK-comparison-two-cell-diff-modes.md`) shows the reasons but still permits the diff
  — inspecting a bad comparison is legitimate, silently averaging it is not;
- the chart (`TASK-comparison-metric-collection-and-charts.md`) excludes non-comparable points from
  aggregates and draws them hollow;
- the sweep axis (`TASK-comparison-parameter-sweep-axis.md`) marks a seed sweep as a sweep series, not
  a like-for-like comparison, because rule 2 is violated by construction.

Expose the verdict on the API (`GET /api/comparison-sets/:id` and the cell read) so the frontend does
not re-derive it client-side. Non-comparable cells are still viewable and diffable — they are excluded
from aggregates only, and only unless the user explicitly overrides.

## Acceptance Criteria

- [ ] One exported function returns `{ comparable, reasons }` for a variant pair; no second implementation exists elsewhere
- [ ] Each of the four rules has a named reason string, and multiple violated rules all appear in `reasons`
- [ ] A pinned-seed variant paired with an unpinned (`seed IS NULL`) variant is non-comparable with a seed-policy reason
- [ ] Different `width`/`height` produces a resolution reason; different `reference_set` order produces a reference reason
- [ ] The verdict is present on `GET /api/comparison-sets/:id` responses so the frontend does not recompute it
- [ ] The chart excludes non-comparable points from aggregates but still plots them hollow
- [ ] The diff view still opens for a non-comparable pair and displays the reasons
- [ ] `src/comparisons/comparability.test.ts` covers each rule, the multi-reason case, and the fully-comparable case
