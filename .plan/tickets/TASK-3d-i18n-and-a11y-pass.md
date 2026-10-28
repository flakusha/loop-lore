<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 3D i18n and a11y pass

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-3d-generation
**Tags:** 3d, i18n, a11y
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

i18n strings plus accessibility for the viewer and run surfaces (repo conventions src/frontend/a11y/, src/i18n/). AC: viewer controls are keyboard-reachable with labels; all new UI strings resolve through ctx.t with locale entries for the default locale set.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
