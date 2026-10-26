<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Image/audio providers have no BYO key or failover

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ImageGenOptions carries no key; only openai family sends server apiKey; sdcpp/sdapi/comfyui send no auth. generateImages single-picks via pickSdProvider, no iteration/breaker. Fix: thread optional resolved key into transports; add cross-backend retry for hosted endpoints.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue b104dd8 (registry tip: 2c4a7734d Konstantin Fedotov Close issue)
