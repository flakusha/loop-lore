<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Restrict ACP strategy enum to failover

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

G10 (harness-acp-implementation-review-2026-11-03.md:191; plan §3.4): schema validates failover|best-of|split but only failover is implemented (packages/core/src/config/schema/harness.ts:68-69; src/integrations/harness/profile-selector.ts:20-21). Fix: restrict union to 'failover'; update schema-class and JSON-schema mirrors in same change. AC: strategy best-of fails validateProfile; failover configs unchanged. Un-restrict when best-of/split land (epic tasks).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
