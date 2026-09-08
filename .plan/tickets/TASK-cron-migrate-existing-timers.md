<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## TASK: Migrate existing timers onto the cron registry

**Status:** ✅ Done
**Priority:** High
**Effort:** Small
**Epic:** epic-cron-scheduler
**Related:** TASK-cron-registry-core

## Summary

Move the three hand-rolled `setInterval` timers onto `Bun.cron` via the
registry; delete the raw timer paths and their bespoke shutdown code.

## Context

- `src/telemetry/cleanup.ts` `startRetentionCleanup` — handle dropped, never
  stopped/unref'd; `src/server/start.ts:158-160` calls it bare.
- `src/async/offload.ts` `startOffloadDaemon` — keep `runOnce()` + spill/expire
  logic, drop the internal `setInterval`; the `running` overlap guard becomes
  redundant under cron no-overlap (keep as cheap belt-and-braces or remove).
- `src/crypto/key-rotation.ts` `startAutoRotationTimer` — `start.ts:83-96`
  manual SIGTERM/SIGINT cleanup moves into `scheduler.stop()`.

## Acceptance Criteria

- [ ] Jobs `telemetry.retention` (`@daily`), `async.offload` (`*/5 * * * *`),
  `crypto.key-rotation-check` (`@daily`) registered; schedules config-overridable
- [ ] Raw `setInterval` paths removed; per-service `run*` functions kept as the
  job `run` body so existing unit tests pass unchanged
- [ ] `start.ts` owns one lifecycle: `startScheduler` after migrations,
  `scheduler.stop()` on SIGTERM/SIGINT/exit path; rotation-timer cleanup block deleted
- [ ] No behavior change: same default cadences as the old intervals
- [ ] `bun run check` green
