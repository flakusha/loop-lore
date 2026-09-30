<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Generic 2D graph-canvas renderer reusing game-canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryExtract a generic node/edge 2D canvas renderer from the existing game-canvas so every relationship-graph ticket in this batch shares one draw + interaction layer instead of forking it.<a name="context"></a>## ContextReuse: src/frontend/alpine/game-canvas/draw.ts (drawScene, drawPlaceholder, KIND_COLORS), src/frontend/alpine/game-canvas/index.ts (refresh/poll, click hit-test, selection), src/components/chat/game-canvas.html, docs/spec/game-canvas.md. Nothing generic exists today: TASK-relationship-map-visual-graph is Done but mock-only with no canvas; TASK-graph-view-of-plan-links is SVG/DOM; game-canvas draws grid tokens only, no edges.<a name="acceptance"></a>## Acceptance Criteria- [ ] New src/frontend/alpine/graph-canvas/{types,draw,index}.ts renders nodes {id,label,kind,color} + edges {from,to,label} from a JSON payload on 2D canvas.- [ ] Click hit-test selects node/edge, empty state shows placeholder, static layout (server-side or radial) suffices, no force-physics in v1.- [ ] game-canvas keeps working unchanged (import shared helpers or duplicate deliberately, one direction only).- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
