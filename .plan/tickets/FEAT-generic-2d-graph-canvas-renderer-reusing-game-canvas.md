<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Generic 2D graph-canvas renderer reusing game-canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-2d-sprite-world.md
**Tags:** 2d-graph, canvas

**Summary:** Extract a generic node/edge 2D canvas renderer from the existing game-canvas so every relationship-graph ticket in this batch shares one draw and interaction layer instead of forking it.

**Context:** Reuse targets: `src/frontend/alpine/game-canvas/draw.ts` (`drawScene`, `drawPlaceholder`, `KIND_COLORS`), `src/frontend/alpine/game-canvas/index.ts` (poll/refresh, click hit-test, selection), `src/components/chat/game-canvas.html`, `docs/spec/game-canvas.md`.

Nothing generic exists today: TASK-relationship-map-visual-graph is Done but mock-only and never used a canvas; TASK-graph-view-of-plan-links is SVG/DOM; game-canvas draws grid tokens only, with no edges.

**Acceptance Criteria:**

- [ ] New `src/frontend/alpine/graph-canvas/{types,draw,index}.ts` renders nodes (`id`, `label`, `kind`, `color`) and edges (`from`, `to`, `label`) from a JSON payload onto a 2D canvas.
- [ ] Click hit-test selects a node or edge; empty state shows the placeholder; static layout (server-side or radial) suffices — no force-physics in v1.
- [ ] game-canvas keeps working unchanged — shared helpers are imported in one direction only (graph-canvas may depend on game-canvas, not the reverse).
- [ ] `bun run check` green.
