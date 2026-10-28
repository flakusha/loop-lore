<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Environment kit assistant workflow

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, assistant
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

A world-environment workflow template (world/location pick, tier selection, manifest preview, confirm, dispatch) on the workflow-engine family. AC: stubbed-backend end-to-end test; preview shows the resolved manifest plus planned generate-or-reuse decisions before dispatch.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
