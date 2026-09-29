<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Watchdog Admin UI Page + API

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, admin, observability, ui
**Epic:** epic-recursive-self-improvement

Admin surface for watchdog: `GET /api/admin/watchdog` over `watchdog_events` plus UI page with supervisor state, crash timeline, restart history.

## Core Features

- `GET /api/admin/watchdog?limit=&state=&since=` (admin-scoped, paginated) — current supervisor state + recent `watchdog_events`; extends `src/admin/provider-health.ts` pattern.
- Admin UI page (same stack as existing admin pages) — state badge (starting/healthy/degraded/crashed/stopping), crash timeline, restart-count chart, threshold-breach alert banner.
- Read-only: no restart/stop buttons without `confirm: true` (Part D constraint).

## Acceptance Criteria

- [ ] API returns current state + paginated events; state and time-range filters work
- [ ] UI page renders state badge, timeline, alert banner from live API data
- [ ] Non-admin requests get 401/403 via `src/middleware/admin-gate.ts`
- [ ] Crash-threshold breach (#1) surfaces as banner within one poll interval

## Files

- `src/routes/admin/watchdog.ts` — new
- `src/routes/admin/watchdog.test.ts` — new
- `src/admin/provider-health.ts` — extend with watchdog state

## Notes / Verification

- Depends on #1 (supervisor state), #3 (`/health` probe), #4 (`watchdog_events` table).
- Reuse `src/middleware/admin-gate.ts`; no new auth primitive.


git issue: d67ae69
