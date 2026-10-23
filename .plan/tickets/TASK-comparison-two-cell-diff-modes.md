<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison two-cell technical diff — difference, side-by-side, flicker

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-technical-comparison-charts
**Related:** `TASK-comparison-grid-frontend.md`, `TASK-comparison-comparability-validation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Given two selected grid cells, render a technical diff in three modes: absolute/overlay difference,
side-by-side, and flicker (A/B at a chosen fps). This is a pure client-side canvas instrument over
two asset byte streams.

## Context

Both cells are already selected by the comparison grid (`TASK-comparison-grid-frontend.md`) and
already resolve to asset ids served from `/api/assets/:id/raw` — the same raw path the gallery preview
modal uses. There is **no server-side image processing needed**: decode both images into an
`ImageBitmap`/`<canvas>` and composite in the browser.

Modes:

- **Difference** — per-pixel absolute delta, with a gain slider and an invert toggle so near-identical
  outputs are readable; render black where identical by default.
- **Side-by-side** — synchronized pan/zoom across both panes; a split slider is cheaper than two
  synced viewports and covers the same ground for a technical instrument.
- **Flicker** — alternate A/B at a user-set fps with a frame counter, so an observer can judge
  which frame is which without a label flash.

Dimension mismatch is the normal case here, not an error: when the two cells differ in
`width`/`height`, scale for display but **state the scale factor in the diff chrome** — a silently
rescaled comparison is a lie. The comparability rules in
`TASK-comparison-comparability-validation.md` decide whether a warning badge is required on top.

Front-end idiom: Alpine component registered in `src/frontend/alpine/index.ts`, driven from a partial
at `src/partials/comparisons/diff.html` (auto-discovered). Canvas work lives in the component module
under `src/frontend/`, tested the way the existing frontend modules are
(`src/frontend/tests/test-types.ts` supplies the DOM test types).

## Acceptance Criteria

- [ ] `src/partials/comparisons/diff.html` renders for any two selected cells and is auto-discovered
- [ ] Difference mode composites the two images per-pixel; two byte-identical assets render fully black at gain 1
- [ ] A gain slider and an invert toggle both change the difference output observably
- [ ] Side-by-side mode pans and zooms both panes in lockstep; a split slider is offered
- [ ] Flicker mode alternates A/B at a user-set fps and shows a frame counter
- [ ] Cells of different `width`/`height` display with an explicit scale factor in the diff chrome rather than silently rescaling
- [ ] Selecting two `failed` or in-flight cells does not open the diff; the grid already blocks that selection
- [ ] Canvas compositing is covered by a test using the existing frontend test harness (`src/frontend/tests/`)
