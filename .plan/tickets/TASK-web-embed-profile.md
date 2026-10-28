<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web embed profile

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-game-asset-pipeline-export
**Tags:** export, web
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Web-embed projection (viewer-compatible URLs plus lazy manifest) consumed by the in-app surfaces and the embeddable frontend family; the same manifest drives the in-app 3D viewer and the exported web bundle. AC: lazy loading verified (no 3D fetch before reveal); the web profile rides the same packaging as the engine profiles.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
