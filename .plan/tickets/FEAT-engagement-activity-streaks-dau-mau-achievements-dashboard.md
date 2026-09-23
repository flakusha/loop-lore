<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Engagement — activity streaks, DAU/MAU, achievements dashboard

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Add admin engagement analytics endpoints (DAU/MAU, activity streaks, achievements dashboard) and a matching admin dashboard component.
**Context:** gap-audit 2026-09-23 of `epic-analytics-observability` (E13) found no admin-side engagement aggregation; the existing `telemetry_events` data is under-utilized and product/ops cannot answer stickiness or streak questions.
**Acceptance Criteria:** Four admin-gated endpoints (`/api/admin/engagement/{dau,mau,streaks,achievements}`) return correct aggregates from `telemetry_events` and achievement data; dashboard component renders them; tests cover DAU/MAU counting, streak run detection, achievement aggregation, and admin guard.

## Summary

## What

Gap-audit item **E13**: admin engagement analytics. No admin-side engagement analytics exist. Need:

1. **Activity streaks** — consecutive-day active-user counts (per user and aggregate), longest streak, current streak.
2. **DAU/MAU** — daily/monthly active user counts and ratio from existing telemetry events.
3. **Achievements dashboard** — admin view of unlocks/progress from `epic-achievements` data; counts of earned badges, top achievements, recent unlocks.

Activity data may already be flowing through `telemetry_events` (and related chat/message activity tables), but there is no admin-side aggregation route that surfaces engagement metrics. The chat-level and message-level telemetry routes under `src/routes/telemetry.ts` are admin-only baselines; engagement aggregation is missing.

## Why

Recent gap audit (2026-09-23) of the Analytics & Observability epic — engagement is the third outstanding analytics gap (E13 alongside E10 latency/percentiles/SSE and E11 error monitoring). User-facing achievements exist but the admin has no aggregate view, so product/ops cannot answer:

- How many users were active today / this month?
- What is the DAU/MAU ratio (stickiness)?
- How many users are on a 7-day or 30-day streak?
- Which achievements are being unlocked and how often?

Without these aggregations the analytics epic cannot close; the existing `telemetry_events` data is under-utilized.

## Scope

**In scope:**

- New aggregation queries + endpoints under `src/routes/telemetry.ts` (admin-only):
  - `GET /api/admin/engagement/dau` — daily active users (window parameter, default last 30 days).
  - `GET /api/admin/engagement/mau` — monthly active users (window parameter, default last 12 months).
  - `GET /api/admin/engagement/streaks` — current and longest consecutive-day activity streaks per user (with summary aggregates: total users with active streak, distribution).
  - `GET /api/admin/engagement/achievements` — top achievements by unlock count, recent unlocks, achievement progress distribution.
- Reuse existing `telemetry_events` and `asset_links`-style queries where possible; do NOT introduce a new analytics pipeline.
- New admin component for the engagement dashboard (consistent with the analytics dashboard patterns in `src/routes/analytics.ts` and the existing analytics UI).
- Streak calculation: count distinct active days per user from `telemetry_events` (or equivalent activity table) and collapse into runs.

**Out of scope:**

- Real-time live push (covered separately by gap-audit E10 SSE).
- Error monitoring / alerting (covered separately by gap-audit E11).
- Memory visualizer (covered separately by FEA-2026-058).
- User-facing achievements UX changes — admin aggregation only.

## Acceptance Criteria

- [ ] `GET /api/admin/engagement/dau` returns DAU counts per day for the requested window.
- [ ] `GET /api/admin/engagement/mau` returns MAU counts per month for the requested window.
- [ ] `GET /api/admin/engagement/streaks` returns per-user current + longest streaks, plus aggregate distribution.
- [ ] `GET /api/admin/engagement/achievements` returns top achievements by unlock count and recent unlocks.
- [ ] All four endpoints are admin-only (existing admin guard pattern reused).
- [ ] Streak calculation correctly handles gaps (a user inactive one day breaks the current streak).
- [ ] Admin engagement dashboard component renders the four metric groups.
- [ ] Routes registered in `src/elysia-app.ts` alongside the existing analytics/telemetry mounts.
- [ ] Tests covering: DAU/MAU counting correctness, streak run detection, achievements aggregation, admin guard.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
