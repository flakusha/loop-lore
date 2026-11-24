<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bearer scope config surface and 403 mapping plus rotation hookup

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: src integrations honkbox plus admin honkbox panel; scoped-key config, scope-miss 403 maps to named insufficient_scope, rotation without restart; legacy single-key path untouched. Note: in-flight as slice A in tree honkbox-coverage-2026-11-24; close as duplicate if landed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
