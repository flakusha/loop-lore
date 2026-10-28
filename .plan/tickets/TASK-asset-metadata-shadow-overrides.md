<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Asset metadata shadow overrides

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Let users correct generation metadata via non-destructive shadow overrides: original values preserved and revertible, same philosophy as asset_transforms. AC: an override hides the captured value without mutating it; revert restores the original; overrides are owner-scoped.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
