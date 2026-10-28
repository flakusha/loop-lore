<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Environment kit terrain tier

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, terrain
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Heightmap/terrain tier: derived-map depth fallback plus external CLIs (Hesiod/Infinigen) behind capability probes; heightmap assets with terrain metadata; ML terrain research explicitly out. AC: absent binaries produce a fast, explained failure; present binaries produce a heightmap asset linked to the location, consumable by canvas and 3D viewers.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
