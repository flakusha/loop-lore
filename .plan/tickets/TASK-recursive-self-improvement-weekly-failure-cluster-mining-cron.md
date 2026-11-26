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

Weekly cron mining `watchdog_events` + `tooling_reports` + CI failure logs, clustering recurring failures by signature, auto-opening/updating one ticket per cluster.

## Core Features

- `src/server/watchdog/cluster-miner.ts` — groups events by normalized signature (route + error class + top stack frame); emits clusters with count, first/last seen, example event IDs. **Persistent-failure clustering consumes `tooling_reports`** (migration 113, TASK-tooling-report-store-and-ingest-api) instead of `log_entries`: rows already carry `source`/`category`, and the store's dedupe upsert means one open cluster per `dedupe_key` with `count`/`last_seen` maintained by the ingest API — the miner thresholds on `count` and reads `first_seen` from `ts` / `last_seen` directly rather than re-clustering raw logs.
- Cron registration in `src/routes/admin/cron.ts` (weekly, same pattern as existing jobs); runbook entry in `docs/ops/watchdog.md`.
- Auto-ticket: opens `.plan/` ticket per new cluster above threshold (>=3 occurrences/week); updates existing open ticket instead of duplicating.
- Dry-run mode logs clusters without filing; threshold + enable flag behind config.

## Acceptance Criteria

- [ ] Persistent-failure clusters are mined from `tooling_reports` (`category = 'persistent_failure'`, grouped by `dedupe_key`, thresholded on `count`, windowed by `ts`/`last_seen`) — not from `log_entries`
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

- Depends on #1 (supervisor emits events) and #4 (`watchdog_events` table); persistent-failure clustering depends on the tooling report store (`TASK-tooling-report-store-and-ingest-api`, migration 113 `tooling_reports`).
- Fire-and-forget sink; never throw into cron loop.


git issue: 7b76f23
