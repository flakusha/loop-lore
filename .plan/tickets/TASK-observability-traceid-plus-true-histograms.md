<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: observability traceId plus true histograms

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-performance-dashboard-slo
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-performance-dashboard-slo.md (+ epic-api-telemetry.md). Slices: traceId/spanId in LogEntry plus ALS propagation, business-metric counters, single-renderer true histogram buckets, PromQL alert rules. Defer OTEL collector, Sentry, replay endpoints. Caveats: cardinality explosion, log volume growth, alert noise.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
