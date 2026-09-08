<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Cron Scheduler (Internal Scheduled Tasks)

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** cron, scheduler, background-jobs, maintenance, bun

## Summary

Central registry for internal time-based jobs on `Bun.cron`
(in-process), alongside the existing event-driven architecture
(plugin `emitPluginEvent`, background init). Replaces ad-hoc
`setInterval` timers with named, config-gated, observable schedules;
adds the missing periodic memory-maintenance jobs.

## Context

Event-based hooks (`src/plugins/event-bus.ts`, `src/server/init-background-services.ts`)
cover reactive work. Time-based maintenance is currently ad-hoc
`setInterval` timers with no registry, no admin visibility, no clean
shutdown, and uneven error handling:

- `src/telemetry/cleanup.ts` — `startRetentionCleanup` (24h, fire-and-forget,
  handle dropped, never `unref`d, can't stop).
- `src/async/offload.ts` — `startOffloadDaemon` (5min scan; best-in-class:
  `stop()` + `runOnce()` + overlap guard).
- `src/crypto/key-rotation.ts` — `startAutoRotationTimer` (wired in
  `src/server/start.ts` with manual SIGTERM/SIGINT cleanup).
- `src/memory/purge.ts` — `applyDecay` / `purgeStaleMemories` exist but have
  **no periodic caller**; decay/purge only runs when explicitly invoked.

## Bun Approach (probed on Bun 1.4.2, `bun-types/bun.d.ts`)

`Bun.cron(expression, callback, { tz })` → `CronJob` is available
(`typeof Bun.cron === "function"`, arity 3). Properties that shape the design:

- **In-process**, shares closures/module state/DB connections; dies with the
  process. OS-level overload (module path + title, survives reboot) is out
  of scope — single-instance server doesn't need it.
- **No-overlap guarantee**: next fire computed only after the callback
  settles. Long jobs skip missed fires instead of stacking — matches
  maintenance semantics; the manual `running` guard in `offload.ts` becomes
  redundant for cron-driven jobs.
- **Error semantics = `setTimeout`**: sync throw → `uncaughtException`,
  rejection → `unhandledRejection`; job reschedules after error. Registry
  MUST wrap callbacks with try/catch → structured logger so one failing job
  neither kills the process nor fails silently.
- **`--hot` safe**: jobs re-register on module re-evaluation, deleting the
  line unregisters. Dev-only concern; production runs from `dist/`.
- `.unref()` lets maintenance jobs not keep the process alive — needed for
  CLI/test contexts. Default keeps alive (like `setInterval`).
- 5-field POSIX expressions + nicknames (`@daily`, `@hourly`); OR semantics
  for day-of-month/day-of-week. `Bun.cron.parse` previews next fire time
  (useful for admin "next run" display).

## Design

```typescript
import { defineJob, startScheduler, stopScheduler } from "./cron/registry";

// src/cron/registry.ts — single registration surface
const job = defineJob({
  name: "telemetry.retention",
  schedule: "0 3 * * *", // or "@daily"; overridable via config
  unref: true,
  run: async ({ db, config, logger }) => { /* ... */ },
});

// src/server/start.ts — after migrations, before plugins load
const scheduler = startScheduler(db, config, logger);
process.on("SIGTERM", () => scheduler.stop());
```

Job context passes the existing `Kysely<DB>` handle, `Config`, and a child
logger — same state-sharing the in-process model already assumes. Each job:
config-gated (`enabled` flag + schedule override), status tracked
(last run, next run via `Bun.cron.parse`, last error), manual `runOnce()`
for tests/admin trigger.

### Initial job set

| Job | Source | Default schedule |
| --- | ------ | ---------------- |
| `telemetry.retention` | migrate `startRetentionCleanup` | `@daily` (3am) |
| `async.offload` | migrate `startOffloadDaemon` scan/expire | `*/5 * * * *` |
| `crypto.key-rotation-check` | migrate `startAutoRotationTimer` | `@daily` |
| `memory.decay` | new — `applyDecay` | `@hourly` |
| `memory.purge` | new — `purgeStaleMemories` (soft-mark default; `hardDelete` opt-in) | `@daily` |
| `providers.health-rescan` | new — `scanAllProviders` (currently startup-only) | `*/15 * * * *` |

Migration keeps existing `runOnce()`/stateless function entry points so unit
tests don't need a scheduler; the registry only owns timing + lifecycle.

## Scope

- `src/cron/` registry: `defineJob`, `startScheduler`/`stop`, status tracking,
  error-to-logger wrapper, config section (`cron.jobs.<name>`: enabled,
  schedule override).
- Migrate the three existing timers onto the registry; delete the raw
  `setInterval` paths.
- New memory decay/purge schedules (config-gated, off by default until tuned
  or on with conservative defaults — ticket decides).
- Admin observability: job list + last/next run + last error + manual trigger
  (REST surface; UI only if cheap).
- Docs: `docs/` scheduler section (job catalog, adding a job, cron syntax).

## Non-Goals

- OS-level `Bun.cron(path, title)` jobs (survive reboot) — single-instance
  server doesn't need them.
- Distributed locking / multi-instance leadership — out of scope until
  horizontal scaling lands.
- Replacing the event bus — cron complements events, never replaces them.

## Dependencies

- Sibling: `epic-api-task-offloading.md` (async store is a job client, not
  the scheduler itself).
- Touches: telemetry, async store, crypto rotation, memory purge, admin.

## Files

- `src/cron/registry.ts` — job registry + lifecycle (new)
- `src/cron/jobs/*.ts` — per-job run functions (new, thin over existing services)
- `src/cron/types.ts` — `CronJobDef`, `JobStatus`, `JobContext` (new)
- `src/config/sections/cron.ts` — config schema (new)
- `src/server/start.ts` — wire `startScheduler` / shutdown `stop()`
- `src/telemetry/cleanup.ts`, `src/async/offload.ts`,
  `src/crypto/key-rotation.ts` — migrate to registry, drop raw timers
