<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire game-canvas clicks to travel and VN-select endpoints

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

game-canvas click (src/frontend/alpine/game-canvas/index.ts onCanvasClick) hit-tests tokens then only sets selected + redraws — no transition emitted, while POST .../locations/:locId/travel (location-edges.ts:322) and POST vn select (vn-choices.ts) already exist. Epic: epic-display-transitions (task 5). Research: .tmp/research/2d-canvas-3d-world/transitions.md sections T3/T5.5. Acceptance: zone click resolves zone-at then POSTs validated travel (edge-hop semantics, server rejects invalid); actor/choice click POSTs VN select via the canvas-click-to-VN payload contract (TASK-2d-world-review-canvas-click-to-vn-choice-card-payload-contr); invalid clicks toast, never silent. Related: TASK-2d-world-review-canvas-click-to-vn-choice-card-payload-contr (contract), FEAT-2d-world-click-to-move-prediction-reconcile-proximity-to-cha (prediction/reconcile), FEAT-2d-world-view-only-canvas-map-custom-canvas-zones-sprites-at (zone render prereq). Caveats: clicks outside htmx swaps must not kill render ctx (same rule as egui-canvas mount); server is authoritative — client never fabricates positions.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
