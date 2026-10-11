<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(rate-limit): per-route rate-limit analytics dashboard

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Derived-feature proposal F02 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-api-rate-limiting.md` (In Progress) + `epic-analytics-observability.md` (Not Started) + `epic-frontend-admin.md` (Done) + T01/T03/T06 (governance coverage on every v1 path) + existing `governanceGuard`/`MetricsCollector` seam (`src/routes/v1/governance.ts`, `src/api-governance/telemetry/collector.ts`).

Derivation: The collector already records per-route status + latency and counts 429s (`rate_limited_total`); `governanceEndpoints` already exposes self `/rate-limit/status` and admin `/metrics`. T01/T03/T06 close the coverage holes (upload path, fallback path) that would make any dashboard lie by omission — once every v1 route emits, the dashboard is a read-model over data already collected.

Draft epic sketch / acceptance:

- Admin dashboard page shows per-route 429 heatmap + p50/p95 latency from the existing collector snapshot.
- Per-user self view extends `/rate-limit/status` with per-policy remaining/reset (no new collection).
- Upload-path (T03) and fallback-path (T06) traffic appears as first-class rows, proving coverage.
- Prometheus exposition (`renderPrometheus(metrics)`) stays the machine surface; dashboard is the human surface over the same snapshot.
- Alert threshold config (e.g. 429-rate spike) reuses the cron scheduler epic (`epic-cron-scheduler.md`, Done).

Priority: high — turns governance from an enforcement black box into operable capacity signal; prerequisite fixes already scoped.

Blocked-by: T01/T03/T06.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). High-priority composition group F01-F05.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
