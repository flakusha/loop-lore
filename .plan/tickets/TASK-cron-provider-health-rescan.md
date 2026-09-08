<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## TASK: Provider health rescan schedule

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Epic:** epic-cron-scheduler
**Related:** TASK-cron-registry-core

## Summary

Re-run `scanAllProviders` (`src/admin/provider-health.ts`) on a cron cadence
instead of startup-only, so dead providers surface without a restart.

## Context

`src/server/start.ts:63-78` scans once at boot and logs. A 15min rescan keeps
the admin health view truthful and can feed future alerting; must be cheap and
quiet when all healthy (debug-level log on no-change).

## Acceptance Criteria

- [ ] `providers.health-rescan` (`*/15 * * * *`, config-gated) runs the scan;
  logs only on state change or failure
- [ ] Failures never throw out of the job (error-to-logger wrapper covers it,
  but assert explicitly in test)
- [ ] `bun run check` green
