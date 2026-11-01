<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui-i18n-locale-wiring

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-i18n
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

egui renders locale strings via the shared i18n catalog. Web reference: src/frontend/alpine/i18n.ts. Missing: zero i18n or locale handling in native/loop-lore-egui. Acceptance: locale-selected strings on main surfaces; rust test covers switching.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
