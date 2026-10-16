<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: No image-provider plugin seam; adding family touches 7+ sites

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

New family needs ImageApiFamily + schema + config + generateImages switch + ops branch + families transport + LoRA gate in lockstep; two parallel dispatch sites must stay synced. Fix: single provider registry mirroring LLM BaseProvider/registry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
