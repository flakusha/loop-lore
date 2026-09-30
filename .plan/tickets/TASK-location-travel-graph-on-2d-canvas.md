<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Location/travel graph on 2D canvas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryRender locations + travel routes as a node/edge graph on the shared graph-canvas: locations as nodes (zones), travel_routes/connections as edges. Read-only v1; other applicable graph cases beyond this batch should reuse the same renderer, not fork it.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Sources: locations (parent/child fractal tree via LocationTreeService), travel_routes + travel_route_stops, connections (validateConnections). Related: TASK-location-graph-editor-and-discovery-gating, TASK-party-free-jump-location-graph-edge, TASK-2d-world-review-zone-adjacency-validation-missing. Zone x/y rects (map_zones, future) can seed node positions; tree depth fallback is radial layout.<a name="acceptance"></a>## Acceptance Criteria- [ ] GET endpoint returns location nodes + route/connection edges scoped by world_id, capped at 200 nodes with paging.- [ ] Graph-canvas renders location nodes by kind, click shows detail; undiscovered locations hidden per discovery gating.- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
