<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Auto-started llama.cpp skips circuit-breaker registration

**Status:** Not Started
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
