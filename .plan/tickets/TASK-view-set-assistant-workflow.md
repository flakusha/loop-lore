<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set assistant workflow

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-view-set-generation
**Tags:** views, assistant
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

A view-set workflow template in configs/templates/workflows/ (steps: subject pick, tier, camera plan, confirm, dispatch to the view-set run route) plus dispatch backend registration in the workflow-engine family. AC: end-to-end template test against a stubbed backend (no live ComfyUI in CI); confirmation preview renders the resolved camera plan plus parameter map; NSFW policy passes through the dispatch schema.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
