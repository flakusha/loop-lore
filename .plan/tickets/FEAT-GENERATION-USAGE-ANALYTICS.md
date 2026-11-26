<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# FEAT: Personal usage analytics

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-analytics-observability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Summary:** Add an authenticated Personal Usage page for tokens, spend completeness, active days, and model/provider breakdowns.
**Context:** Open WebUI usage-statistics research C4 identified a missing self-service surface. Existing per-session cost meters and admin engagement metrics do not answer what one user consumed over a selected range.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** TASK-cache-token-propagation-into-execusage-exec-log-and-aux-call, TASK-per-model-per-provider-cost-attribution-for-llm-execution-st, TASK-admin-llm-execution-analytics-per-model-per-provider-rollups, TASK-embedding-and-telemetry-retention-policies, FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard

## Summary

Provide a personal usage dashboard backed by existing `messages` and `generation_attempts` facts. Do not introduce a second event pipeline or usage ledger.

## Scope

- Authenticated, user-scoped aggregate endpoint with 7/30/90-day ranges and a bounded maximum window.
- Input/output/total/cache tokens, observed/estimated/missing spend, active days, and top models/providers.
- Simple activity heatmap and model breakdown using existing Alpine/CSS patterns.
- Timezone-aware daily buckets with empty days present.
- Missing usage renders `-`; partial cost is labeled; unknown pricing is never shown as free.
- Reuse the canonical usage envelope and shared pricing registry owned by the dependency tickets.
- Tool breakdown waits until tool-event coverage is complete.

## Dependencies

- `TASK-cache-token-propagation-into-execusage-exec-log-and-aux-call` — canonical usage fields and missing/partial semantics.
- `TASK-per-model-per-provider-cost-attribution-for-llm-execution-st` — pricing, provenance, and cost completeness.
- `TASK-embedding-and-telemetry-retention-policies` — deletion/retention policy before broad personal analytics.

## Out of Scope

- Admin DAU/MAU, streaks, and achievements; those remain in `FEAT-engagement-activity-streaks-dau-mau-achievements-dashboard`.
- Export, raw prompt/content inspection, tool breakdown, charts requiring percentile work, and a generic metrics endpoint.

## Acceptance Criteria

- [ ] Two-user fixture proves every aggregate is scoped to the authenticated user.
- [ ] Range selector issues one bounded request and ignores stale responses.
- [ ] Token totals preserve missing versus zero and include cache fields only when reported.
- [ ] Spend exposes observed/estimated/missing status and aggregate cost coverage.
- [ ] Active days and top models/providers match seeded generation facts.
- [ ] Heatmap uses timezone-aware, gap-filled daily buckets.
- [ ] Missing usage renders `-`; partial cost is visibly labeled.
- [ ] No new telemetry pipeline, rollup table, or usage ledger is introduced.
- [ ] Non-admin and cross-user access checks remain green.

Imported from git issue e98da94.

git issue: e98da94
