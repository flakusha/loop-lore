<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Watchdog operations

## What the watchdog does

The watchdog supervises child processes: it tracks crashes in a sliding
window, counts failed health probes, applies restart backoff, and reaches a
terminal stop when the crash budget is exhausted. Policy lives in
`src/server/watchdog/state.ts`; it reuses the external-server supervision
budget rather than defining a second one. The state machine is pure — timers
and spawning belong to the caller.

## Execution log: `watchdog_events`

Every supervisor transition is written to the `watchdog_events` table by
`createTransitionWriter()` (`src/server/watchdog/transition-writer.ts`). The
row records the event kind, the decision (`restart`, `kill`, `stop`, `wait`),
the timestamp, and any reason, miss, or crash fields the decision carries.
Writes are fire-and-forget: a failed insert logs an error and never throws
into the supervisor. Call `flush()` before shutdown so the final stop/crash
row is not lost.

Query the log with the instance DB, scoped to the instance whose events you
want:

```sql
SELECT event_kind, decision_kind, reason, misses, crashes, at_ms
FROM watchdog_events
ORDER BY at_ms DESC;
```

## Crash-threshold heavy-gate dispatch

The intended threshold-breach path emits a `repository_dispatch` event named
`watchdog.threshold_breach`, which triggers `.github/workflows/watchdog-gate.yml`
to run the heavy gate against `dev` HEAD and post an alert. The GitHub token is
read from `LOOP_LORE_GITHUB_TOKEN`; it is never written to disk. Repeated
breaches in one window should collapse into a single dispatch. This path is
tracked in `TASK-recursive-self-improvement-watchdog-to-heavy-gate-webhook-tr`
and is not yet wired in production — check that ticket before relying on it.

## Weekly failure-cluster mining cron

Job `rsi.failure-cluster-mining` runs on `0 4 * * 0` (weekly), enabled by
default. It is registered in `defaultJobs()` (`src/cron/jobs.ts`) and started
with the rest of the catalog by `startAppScheduler()` (`src/cron/boot.ts`).
The admin `/api/admin/cron/jobs` routes list and trigger jobs manually; they
do not register them.

On each run the job:

1. queries `tooling_reports` for `category = 'persistent_failure'` rows at or
   above the default count threshold, scoped to this instance, via
   `listPersistentFailureClusters()`;
2. groups them by `dedupe_key` with `groupFailureClusters()`;
3. writes the cluster list as JSON to
   `.tmp/rsi/failure-clusters-<YYYY-MM-DD>.json` under the working directory;
4. logs a structured summary with the cluster count and report path.

Errors are logged with `logger.warn` and swallowed — the job never throws
into the scheduler. A missing report usually means the instance slug could not
be resolved or the query failed; check the cron log line before investigating
the data.

To read a report:

```bash
cat .tmp/rsi/failure-clusters-$(date +%F).json
```

Each entry carries `dedupeKey`, `tool`, `count`, `firstSeen` and `lastSeen`,
ordered by count. The file is scratch output under `.tmp/` — it is not a
ticket and is not committed. Ticket filing from clusters is tracked separately
in `TASK-recursive-self-improvement-weekly-failure-cluster-mining-cron`.