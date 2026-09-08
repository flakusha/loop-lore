# Scheduler (Internal Cron Jobs)

Time-based maintenance runs on the in-process `Bun.cron` registry in
`src/cron/`. It complements the event-driven plugin bus
(`src/plugins/event-bus.ts`): events react to things happening, cron handles
things that must happen on a cadence — retention cleanup, decay, rescans.

## Job catalog

| Job | Schedule | What it does |
| --- | -------- | ------------ |
| `telemetry.retention` | daily 03:00 | delete telemetry events past retention |
| `async.offload` | every 5 min | spill oversized result bodies, expire old rows |
| `crypto.key-rotation-check` | daily 04:00 | rotate expired actor keys (skipped when `keyRotationDays = 0`) |
| `memory.decay` | hourly | fade memory strength by elapsed time |
| `memory.purge` | daily 05:00 | soft-mark stale memories (confidence to near-zero) |
| `providers.health-rescan` | every 15 min | re-scan providers, log on state change |

## Configuration

```toml
[cron]
enabled = true

[cron.jobs."memory.purge"]
enabled = false
schedule = "0 6 * * *"
```

- `cron.enabled = false` leaves every job unregistered (master switch,
  also via `CRON_ENABLED` env).
- Per-job `enabled` / `schedule` overrides keyed by job name. Unknown names
  fail at boot so typos never idle silently.
- Schedules are 5-field POSIX cron (`minute hour day month weekday`) plus
  nicknames (`@hourly`, `@daily`, …).

## Adding a job

1. Add a `defineJob({ name, schedule, enabled, run })` entry in
   `src/cron/jobs.ts`. Keep `run` thin — delegate to a service function.
2. Keep the service unit directly testable (no scheduler import); the
   registry owns timing, status, and error handling.
3. Failing runs are logged and recorded in job status; the job reschedules —
   never let a throw escape `run`.

## Observability

Admin endpoints (require `admin.system`):

- `GET /api/admin/cron/jobs` — name, schedule, enabled, last/next run,
  last error, run count.
- `POST /api/admin/cron/jobs/:name/run` — trigger a single run now.

## Guarantees and limits

- No-overlap: the next fire is computed after the callback settles, so slow
  runs skip rather than stack.
- Jobs are `unref`'d — they never keep the process alive and stop on
  `scheduler.stop()` during graceful shutdown.
- In-process only: state (DB handle, config) is shared, jobs die with the
  process. No multi-instance leadership — out of scope until horizontal
  scaling lands.
