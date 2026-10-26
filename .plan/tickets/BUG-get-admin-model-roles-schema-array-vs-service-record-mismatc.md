<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: GET admin/model-roles schema Array vs service Record mismatch

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-schema
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Route declares overrides: t.Array (routes/admin/model-roles.ts:48) but service returns Record<string,...> (model-capabilities model-roles.ts:192-211). Silent contract break for typed clients. Fix: t.Record.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue bc0043f (registry tip: b4f9b14cb Konstantin Fedotov Close issue)
