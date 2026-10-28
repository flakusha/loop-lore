<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scene layout LLM step

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, llm
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Aux/assistant step: world/location context (budgeted assembly) produces a manifest draft grounded in existing rows (worlds, locations, world_lore_entries, location_edges), using the fenced-block extractor pattern (src/regex/game-state.ts). AC: a fixture world yields a manifest referencing only real assets or requestable kits; hallucinated asset ids are rejected by validation and re-prompted; determinism under a fixed seed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
