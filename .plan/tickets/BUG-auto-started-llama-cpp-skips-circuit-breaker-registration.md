<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Auto-started llama.cpp skips circuit-breaker registration

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue cb06262): Verified: src/server/init-background-services.ts:83-88 calls registerProvider(name, new OpenAiCompatibleProvider(...)) with no circuitBreaker.register anywhere in the file (imports at :6 confirm it is not even imported).
**Priority:** high
**Effort:** Medium
**Epic:** epic-provider-plugin-ecosystem
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

registerProvider without circuitBreaker.register (init-background-services.ts:76-88); allowRequest true + onFailure no-op for unknown names — circuit never opens, every failure retried at full cost. Fix: one circuitBreaker.register(name) after registerProvider.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue cb06262 (registry tip: 6b86146d2 Konstantin Fedotov Close issue)
