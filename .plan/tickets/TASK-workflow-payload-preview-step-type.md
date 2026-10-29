<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Workflow payload preview step type

**Status:** Not Started
**Priority:** medium
**Effort:** Small-Medium
**Epic:** epic-workflow-engine
**Tags:** workflow-engine, assistant
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Confirm-preview step type for the workflow engine rendering the assembled run payload (prompt + compiled slots) — shared by the scenario page Run panel and the assistant confirm flow. AC: the preview renders the exact payload that would be submitted; the step reuses the existing approval/confirmation gate machinery; end-to-end tested against a stubbed backend.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
