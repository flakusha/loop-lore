<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Workflow asset pick step type

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-workflow-engine
**Tags:** workflows, steps
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Asset-picker step type for workflow templates (subject/reference selection from existing assets), shared by the view-set, 3D, environment, and export templates. AC: an asset-pick step validates the chosen asset id against owner scope; the step renders a picker in preview and confirm; reusable across templates without per-template wiring.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
