<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS scenario schema

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, db, worlds
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Migration for scenarios, scenario_scenes, scenario_shots, scenario_references, scenario_docs, annotations tables plus enums (scenario status, scene mode, seed mode, reference lane/scope, cut type) and AssetLinkEntity Scenario/Scene/Shot values, insert helpers, and db sync artifacts. Seeds are stored as strings so values above 2^53 survive round-trips exactly. AC: migration up/down/round-trip green; a scenario with 2 scenes x 3 shots plus refs and docs persists and reads back intact; a shot row outside a scene is rejected (FK + CHECK).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
