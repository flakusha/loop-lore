<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Consolidate triple mulberry32 copies and remove Math.random from random-events

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Three mulberry32 implementations exist (src/autonomy/rng.ts:23 canonical, src/rpg/bestiary.ts:208, src/worlds/resource-core.ts:80) while src/chat/random-events.ts still uses Math.random twice (:125,:192). Consolidate callers onto src/autonomy/rng.ts (mulberry32/hashSeed/deriveTickRng) so the seeded-procgen ticket (FEAT-2d-world-seeded-procgen) gets deterministic demo data. Research: .tmp/research/2d-canvas-3d-world/README.md sections 3 and 5. Acceptance: single mulberry32 source; random-events.ts deterministic under seed; existing consumers (conditions, encounters, anomalies, resources, tick) unchanged in behavior. Caveats: seed changes alter world content — keep seed derivation stable; no behavior change to live encounter tables in the same commit, migration-only.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
