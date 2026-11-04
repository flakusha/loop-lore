<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Validate NPC moveToLocation and actor position sets (same-world plus adjacency)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Player edge-hop is server-validated (src/locations/edge-travel.ts:192-249) but NPC moveToLocation (src/rpg/npc-navigation/service/movement.ts:66-106) performs zero destination validation — no same-world, no adjacency/edge check — and POST /actors/:actorId/position (src/routes/worlds/fractal-locations-routes.ts:49) is a direct set. Epic: epic-display-transitions (task 3). Research: .tmp/research/2d-canvas-3d-world/transitions.md section T2.4. Acceptance: same-world + adjacency/edge checks on both paths, matching player hop semantics; owner-bypass and discovery-latch rules preserved. Related: FEAT-2d-world-click-to-move-prediction-reconcile-proximity-to-cha (consumer trust), TASK-2d-world-review-proximity-query-for-nearby-actors-into-group (proximity context). Caveats: validation rejects must return structured errors (not silent no-ops); batch moves stay atomic per actor; no behavior change to already-valid moves.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
