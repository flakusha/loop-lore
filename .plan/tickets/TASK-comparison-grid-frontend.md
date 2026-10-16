<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison grid frontend — matrix view with filter, sort, selection

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-comparison-cell-detail-metadata.md`, `TASK-comparison-two-cell-diff-modes.md`, `epic-frontend-gallery.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The comparison chart surface: an image matrix with models as columns and prompts/references as rows,
plus a parameter table, a comparability badge, and working filter / sort / cell selection.

## Context

Follow the gallery's real htmx + Alpine idiom exactly:

- Page skeleton `src/views/gallery.html` — a `list-toolbar` wrapper, a `data-search-url` /
  `data-target-id` pair around `{{> filter-bar.html}}`, and a grid container with
  `hx-get="/dynamic/gallery/grid" hx-trigger="load" hx-swap="innerHTML"
  hx-indicator="#gallery-indicator"` seeded with `{{> loading-state.html}}`.
- Shared components live in `src/components/` (`filter-bar.html`, `filter-chips.html`,
  `loading-state.html`, `empty-state.html`, `asset-preview-modal.html`); page-local partials live in
  `src/partials/<feature>/` (`src/partials/gallery/preview-modal.html`).
- Views and partials are **auto-discovered** — `discoverViews` (`src/routes/views/constants.ts:22`) and
  `discoverPartials` (`:41`) walk `src/views/` and `src/partials/`+`src/components/`, the latter merged
  across both roots at `:66-69`, so `src/views/comparisons.html` and `src/partials/comparisons/*.html`
  need no allow-list edit.
- Grid fragment handler: `serveGalleryGrid` at `src/routes/views/gallery.ts:144`, registered at
  `/dynamic/gallery/grid` in `src/routes/views/plugin-dynamic.ts:42`. Register the comparison grid at
  `/dynamic/comparisons/grid` in the same plugin, and reject non-htmx requests with the same
  302-to-`/views/` guard the gallery uses.
- Alpine: register a `comparisonGrid` component and add it to the barrel `src/frontend/alpine/index.ts`
  (booted by `src/frontend/alpine-init.ts`). The idiom to copy is `filterBar` in
  `src/frontend/pages/shared.ts:167` — state object, `init()` reading `this.$el.closest('[data-*]')`
  for config, and `triggerSearch()` building `URLSearchParams` then calling
  `globalThis.htmx.ajax("GET", url, { target, swap })`.
- i18n: templates use `{{{ t("key") }}}`; add keys under a `comparison.*` namespace.
- View files carry `<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->` headers (see
  `src/views/gallery.html:1`), matching every other template.

Layout: columns are variants grouped by `model`; rows are prompts (one-row set) or reference assets
(one-column set). Cells show the variant's asset thumb (`/api/assets/:id/raw` or the existing thumb
path) plus a status glyph for `queued`/`running`/`failed`. Cells that fail the comparability rules get
an explicit non-comparable badge — see `TASK-comparison-comparability-validation.md`. Selection is
two-cell (the diff view consumes it).

## Acceptance Criteria

- [ ] `src/views/comparisons.html` exists with an LGPL-3.0-or-later SPDX header and is reachable at `/views/comparisons` with no allow-list edit
- [ ] `/dynamic/comparisons/grid` is registered in `src/routes/views/plugin-dynamic.ts` and 302s to `/views/` on a non-htmx request, matching the gallery handler
- [ ] Grid fragment partial lives at `src/partials/comparisons/grid.html` and is auto-discovered
- [ ] Grid renders models as columns and prompts as rows, with one cell per (row, column) pair
- [ ] `comparisonGrid` Alpine component is registered in `src/frontend/alpine/index.ts` and drives filter, sort, and two-cell selection via `globalThis.htmx.ajax` (the `filterBar` idiom)
- [ ] Sorting by model, seed, steps, cfg, and latency each work; filtering by backend and status works
- [ ] A failed or in-flight cell renders a distinct status glyph and is not clickable as a diff participant
- [ ] `src/routes/views/comparisons.test.ts` — **this ticket owns and creates the file** — covers grid registration, the non-htmx 302, and the matrix shape (column/row counts from a seeded set). Sibling tickets on the same view (notably `TASK-comparison-cell-detail-metadata.md`) add their own cases to it rather than creating a second view test file
