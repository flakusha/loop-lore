<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: supports_vision never refreshed on capability update

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-metadata-read
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Insert derives supports_vision from modalities (model-capabilities.ts:83) but auto-detected update .set() omits it (:57-71). Model gaining vision keeps 0 until row deleted/overridden. Fix: add supports_vision to update .set().

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 55f7fd3 (registry tip: bbbaead47 Konstantin Fedotov Close issue)
