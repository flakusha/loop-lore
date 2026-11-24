<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Rerank via honkbox when capability enabled

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: memory rerank scorer swaps when isHonkboxFeatureEnabled rerank; local ordering contract unchanged. AC: feature off keeps local scorer byte-identical. No server dep; capability already parsed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
