<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comic Page/Panel Layout Model + Authoring Surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-artifact-schema.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-comic-caption-bubble-layout.md`, `epic-visual-novel-mode.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The layout half of the comic product: a page/panel placement model on top of the
`publication_panels` rows from the schema ticket, and an authoring surface for
placing, ordering, and resizing panels on a page. Art generation and bubbles are
separate tickets; this one is the geometry and the editor.

## Context

**A comic page is a laid-out VN scene.** Visual Novel Mode already owns anchored,
z-ordered, layer-composited placement: `src/frontend/vn/sprite-stage.ts` resolves
anchors and stacking, `src/frontend/vn/scene-renderer/` renders a composed scene,
and `src/frontend/vn/templates/template-engine.ts` carries the template/variable
system. Writing a second positioning engine for comics would be reinvention —
this ticket reuses the sprite-stage anchor primitives and adds only the panel
grid abstraction on top.

What is genuinely new is the grid: a panel occupies a rectangle on a page
(`layout_json` on `publication_panels`, carrying row/column/span plus
fractional offsets), pages have a fixed aspect, and panel order is meaningful
(`position` controls reading order, not z-order). Keep those two concerns
separate — reading order from `position`, painting order from the layout
rectangle — so an overlapping panel does not silently reorder the page.

Layout coordinates are **stored, not computed**. A comic page must render
identically in the editor, the viewer, and the exported image sequence; deriving
geometry at render time from a template would let those three drift.

The authoring surface follows the same htmx + Alpine split as the book editor
(`/dynamic/*` fragments from `src/routes/views/plugin-dynamic.ts`, Alpine store
under `src/frontend/alpine/`, shell in `src/views/`).

## Acceptance Criteria

- [ ] A `PanelLayout` type is defined with row / column / rowSpan / colSpan and
      optional fractional x/y/w/h offsets, plus a z-index, and is serialized to
      `publication_panels.layout_json` without loss
- [ ] A pure layout resolver (`src/publications/layout/`) computes panel
      rectangles for a given page width/aspect from stored layout data, with unit
      tests over a 3-row grid, a spanning panel, and a fractional-offset panel
- [ ] The resolver is the **single** source of page geometry — the editor, the
      viewer, and export all call it; none recomputes from a template
- [ ] Reading order comes from `publication_panels.position` and painting order
      from the layout rectangle; a test asserts that changing a panel's z-index
      does not change its reading position
- [ ] Panel resize / move / reorder writes back through the repository layer from
      `TASK-publication-artifact-schema.md` and re-sequences `position` densely
      on delete
- [ ] A comic authoring shell exists at `src/views/publication-comic.html` served
      from `src/routes/views/`, showing one page at a time with its panels
- [ ] Panel editing reuses the VN anchor primitives from
      `src/frontend/vn/sprite-stage.ts` — no second anchor-resolution
      implementation is introduced under the publication tree
- [ ] Fragment endpoints live under `/dynamic/publications/:id/pages/...` and keep
      the `HX-Request` redirect guard in `src/routes/views/plugin-dynamic.ts`
- [ ] Owner authorization enforced on every layout read and write (route test)
- [ ] Layout JSON is schema-validated at the route boundary and rejects unknown
      or out-of-range values rather than persisting them