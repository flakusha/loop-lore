<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: No image-provider plugin seam; adding family touches 7+ sites

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-provider-plugin-ecosystem
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

New family needs ImageApiFamily + schema + config + generateImages switch + ops branch + families transport + LoRA gate in lockstep; two parallel dispatch sites must stay synced. Fix: single provider registry mirroring LLM BaseProvider/registry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue a663603 (registry tip: 45cdedf9f Konstantin Fedotov Close issue)
