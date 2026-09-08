<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## TASK: Cron registry core (`src/cron/`)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-cron-scheduler
**Related:** epic-api-task-offloading

## Summary

Build the central job registry on in-process `Bun.cron`: typed job
definitions, start/stop lifecycle, per-run status, error-to-logger wrapper.

## Context

No shared scheduling surface exists; each timer hand-rolls `setInterval`
with different shutdown/error semantics (`src/telemetry/cleanup.ts`,
`src/async/offload.ts`, `src/crypto/key-rotation.ts`). `Bun.cron`
(probed present, Bun 1.4.2) gives no-overlap + `.unref()` + `Bun.cron.parse`
for next-fire preview.

## Acceptance Criteria

- [ ] `src/cron/types.ts`: `CronJobDef` (name, schedule, unref, enabled, run),
  `JobStatus` (lastRunAt, nextRunAt, lastError, runCount), `JobContext`
  (db, config, logger)
- [ ] `src/cron/registry.ts`: `defineJob`, `startScheduler` returns
  `{ stop(), getStatus(), runOnce(name) }`; callbacks wrapped so throw/reject
  → child logger error, job reschedules, process survives
- [ ] `stop()` cancels every `CronJob`; jobs created `unref()`d per def
- [ ] `getStatus()` reports next run via `Bun.cron.parse`; unit-tested with
  short schedules and `runOnce` (no real-time waiting)
- [ ] `src/config/sections/cron.ts`: `cron.jobs.<name>` = `{ enabled, schedule? }`
  override; unknown job names in config rejected at startup with a clear error
- [ ] `bun run check` green
