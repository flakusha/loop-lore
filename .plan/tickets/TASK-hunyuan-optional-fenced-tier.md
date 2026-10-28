<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Hunyuan optional fenced tier

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-3d-generation
**Tags:** 3d, licensing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Hunyuan3D-Wrapper workflow tier, config-gated off by default with a license acknowledgment flag (territory/MAU fence surfaced in admin UI; Tencent community license restrictions). AC: tier invisible unless enabled plus acknowledged; enabling records the acknowledgment actor and time; no default workflow references it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
