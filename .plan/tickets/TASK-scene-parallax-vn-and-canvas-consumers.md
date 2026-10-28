<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scene parallax VN and canvas consumers

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, vn, frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

VN background parallax layers plus 2D canvas prop placement, both consumers rendering the same scene manifest (extends the VN scene template engine and game-canvas). AC: an identical manifest renders consistently in both surfaces within their paradigms (layer order and parallax factors honored); missing assets degrade to placeholders, never crash.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
