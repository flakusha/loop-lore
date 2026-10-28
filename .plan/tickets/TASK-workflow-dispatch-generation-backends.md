<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Workflow dispatch generation backends

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-workflow-engine
**Tags:** workflows, dispatch
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Register the new dispatch backends (generation-viewset, generation-3d, world-environment, engine-export) through the existing workflow dispatch schema (backend to route) with NSFW policy pass-through; one runner, no per-epic runners. AC: each backend resolves to its run route through the shared dispatch schema; NSFW policy passes through unchanged; no new runner module is created.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
