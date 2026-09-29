<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Weekly Failure-Cluster Mining Cron

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, cron, telemetry, failure-cluster, automation
**Epic:** epic-recursive-self-improvement

Weekly cron mining `watchdog_events` + CI failure logs, clustering recurring failures by signature, auto-opening/updating one ticket per cluster.

## Core Features

- `src/server/watchdog/cluster-miner.ts` — groups events by normalized signature (route + error class + top stack frame); emits clusters with count, first/last seen, example event IDs.
- Cron registration in `src/routes/admin/cron.ts` (weekly, same pattern as existing jobs); runbook entry in `docs/ops/watchdog.md`.
- Auto-ticket: opens `.plan/` ticket per new cluster above threshold (>=3 occurrences/week); updates existing open ticket instead of duplicating.
- Dry-run mode logs clusters without filing; threshold + enable flag behind config.

## Acceptance Criteria

- [ ] Cron runs weekly; clusters >=3 occurrences produce/update exactly one ticket each (no dupes on rerun)
- [ ] Cluster record links first/last seen + example `watchdog_events` IDs
- [ ] Dry-run mode emits cluster report without filing tickets
- [ ] Unit tests for signature normalization + dedupe; integration test for ticket upsert

## Files

- `src/server/watchdog/cluster-miner.ts` — new
- `src/server/watchdog/cluster-miner.test.ts` — new
- `src/routes/admin/cron.ts` — register weekly job
- `docs/ops/watchdog.md` — runbook entry

## Notes / Verification

- Depends on #1 (supervisor emits events) and #4 (`watchdog_events` table).
- Fire-and-forget sink; never throw into cron loop.


git issue: 7b76f23
