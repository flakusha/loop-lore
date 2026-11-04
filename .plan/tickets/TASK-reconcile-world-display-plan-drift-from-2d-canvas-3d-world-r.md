<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Reconcile world-display plan drift from 2d-canvas-3d-world research

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Eight stale plan lines found by .tmp/research/2d-canvas-3d-world/README.md section 7 (verified against tree 2026-11-03): epic-2d-sprite-world.md audit claims no canvas/RNG (game-canvas shipped b4e7de3a5; autonomy/rng.ts shipped); epic-worlds-extension.md:14 claims no map_zones/world_maps (migration 063 shipped both); fractal-locations + world-locations epics Not Started while CTE service + travel engine + recursive tree UI shipped; FEAT-2d-interactive-game-canvas Not Started although built; TASK-023.md dual Status fields (line 6 Not Started / line 13 Done); FEAT-3d-world-map-navigation + FEAT-3d-character-avatar-rendering Done-as-duplicate need Done-markers so they stop looking like implementation. Distinct target list from TASK-reconcile-stale-plan-status-for-shipped-subsystems (different files, not a dup). Acceptance: each line corrected in place; plan:validate green; report section 7 checked off. Caveats: status-only edits, no code changes; keep epic history (append correction notes, do not rewrite audit blocks); coordinate with the finalize wave (plan artifacts regenerate post-merge).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
