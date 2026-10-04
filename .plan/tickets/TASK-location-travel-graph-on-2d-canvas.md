<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Location/travel graph on 2D canvas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** Render locations and travel routes as a node/edge graph on the shared graph-canvas: locations as nodes, routes/connections as edges. Read-only v1; graph cases beyond this batch reuse the same renderer rather than forking it.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Sources: `locations` (parent/child fractal tree via LocationTreeService), `travel_routes` + `travel_route_stops`, and `connections` (validated by `validateConnections`).

Related: TASK-location-graph-editor-and-discovery-gating, TASK-party-free-jump-location-graph-edge, TASK-2d-world-review-zone-adjacency-validation-missing. Future `map_zones` rects can seed node positions; until then, tree depth drives a radial fallback layout.

**Acceptance Criteria:**

- [ ] GET endpoint returns location nodes plus route/connection edges scoped by `world_id`, capped at 200 nodes with paging.
- [ ] Graph-canvas renders location nodes by kind; clicking a node shows its detail; undiscovered locations stay hidden per discovery gating.
- [ ] `bun run check` green.
