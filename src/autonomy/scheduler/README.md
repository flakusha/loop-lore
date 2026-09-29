# Autonomy Scheduler

`src/autonomy/scheduler/` — world-tick loop that drives the actor
autonomy subsystem. The module itself is pure: no singleton, no
`setInterval`, no cron. The caller owns an `AutonomyScheduler`
instance and decides when a tick happens.

In production that caller is the `autonomy.world-tick` job in the cron
catalog (`src/cron/jobs.ts`), which runs every minute. The job only
pumps the due-set selection — per-world cadence comes from each
world's resolved `tickIntervalMs`, so a world whose `next_tick_at`
cursor has not arrived is skipped without being rescheduled.

## Use

```ts
import { AutonomyScheduler, } from "../autonomy";

const scheduler = new AutonomyScheduler(db, { rng: Math.random, },);

// Real-time / accelerated / manual sources all reduce to this:
setInterval(() => {
  void scheduler.tickOnce();
}, 1_000,);

await scheduler.pause(worldId,); // admin pause
await scheduler.stepOnce(worldId,); // step one action (works while paused)
await scheduler.resume(worldId,); // admin resume
const state = await scheduler.stateFor(worldId,);
```

Constructor takes the Kysely handle plus optional `{ governor, rng }`.
`governor` shares a `AutonomyGovernor` across the tick driver;
`rng` makes the driver's jitter coin flip deterministic in tests.

A world that has **never ticked** is due immediately. The due set
left-joins `worlds` against the cursor table rather than reading the
cursor table alone: a never-ticked world has no cursor row, so reading
`world_simulation_state` on its own would never select it and no tick
would ever create the row. `load` synthesizes an epoch cursor for that
case, and `dueWorlds` now agrees with it.

## Due-world selection

A world is **due** when its persisted row satisfies:

```sql
next_tick_at <= :now AND paused = 0
```

Due worlds are dispatched in this order:

1. `next_tick_at` ascending — the most overdue world goes first;
2. `world_id` ascending (lexicographic) as the **tie-break rule**.

Because `world_id` is unique, the ordering is total: two worlds can
never tie, so the dispatch sequence for a given cursor set is
byte-identical after a process restart. That is the deterministic
ordering the ticket requires — the tie-break is _not_ insertion
order, it is the world's own id.

A world with **no row at all** is treated as due (epoch cursor, not
paused) — autonomy does not require an opt-in seed row per world.
`stateFor` and `stepOnce` synthesize the same shape for it.

That guarantee covers **which worlds are selected and in what order**
only — not what a turn does. Wander/flee target choice calls
`Math.random()` directly inside `processMovementTick`
(`src/rpg/npc-navigation/service/processing.ts:160,246`), and the jitter
drop consumes a seeded draw, so movement output is not reproducible yet.
The tier split, the seed placement, and why the governor's TTL cache is
excluded are drafted in `TASK-autonomy-deterministic-turns`.

## Dispatch

Per due world, the scheduler resolves cadence from the layered
`AutonomyConfig` (`tickIntervalMs`) and calls `runNpcMovementTick`
(`src/rpg/npc-navigation/tick-driver.ts`) — the existing pipeline.
The scheduler never moves an NPC itself and owns no dispatch path of
its own. A short-circuit from the driver (`disabled`, `jitter`,
`budget`) is recorded as the outcome but the cursor still advances,
so a budget-denied world is rescheduled rather than dropped or
re-selected on every pass.

BDI reflection and GM beat dispatch are **split out**, not deferred:
`TASK-bdi-plan-recompute-implementation` and `TASK-gm-beat-scheduling`.
The tick driver is the only dispatch target today, and that is a
deliberate boundary rather than a gap — see the split-out ACs in
`.plan/tickets/TASK-story-auto-drive-scheduler.md` for why neither could
be wired here without double-moving NPCs (GM) or authoring the decision
layer from scratch (BDI).

## Persistence

One row in `world_simulation_state` per world (migration `027`):

| Column         | Meaning                                             |
| -------------- | --------------------------------------------------- |
| `world_id`     | PK, FK → `worlds.id` (cascade on delete)            |
| `next_tick_at` | ISO-8601 instant the world becomes due              |
| `paused`       | 1 = admin-paused (excluded from selection)          |
| `last_run_at`  | ISO-8601 instant of the last completed tick         |
| `last_error`   | Last dispatch error (truncated), cleared on success |
| `tick_count`   | Monotonic count of completed ticks                  |

The cursor write is the commit point. A crash mid-tick replays at
most one world tick; pause flags, cursors, and tick counts all
survive a restart, and a fresh scheduler instance reading the same DB
resumes exactly where the previous one stopped. Governor budgets
(`autonomy_budget`, migration `022`) are likewise persistent, so a
restarted process does not reset the rate limit.

`next_tick_at` is compared as a string: the scheduler always writes
`Date#toISOString`, whose fixed-width UTC format sorts identically to
the instants it represents.

## Error handling

A per-world dispatch failure never throws out of `tickOnce`. The
error is written to `last_error`, the world is backed off by
`RETRY_BACKOFF_MS` (5s, fixed — see the `ponytail:` note in
`index.ts`), and the remaining due worlds still tick. `TickResult.errors`
counts the failures and `last_error` is cleared on the next success.

## Telemetry

| Event                            | Payload                                        |
| -------------------------------- | ---------------------------------------------- |
| `scheduler.world_tick.started`   | `world_id`, `tick_count`, `next_tick_at`       |
| `scheduler.world_tick.completed` | + `outcome` (`dispatched:N` / `skipped:<why>`) |
| `scheduler.world_tick.error`     | `world_id`, `error`, `next_tick_at`            |

Per-world event names rather than the ticket's loop-level
`scheduler.tick.*`: a loop counter cannot show which world is stuck,
and the same envelope (`world_id` + payload) is what ops queries for.
Emission is fire-and-forget — a telemetry outage must not stall
autonomy.

## Not in v1

- `giwt sim pause/resume/step` CLI surface — the primitives exist on
  the class; wiring them is a separate ticket (the CLI lives outside
  this module).
- BDI reflection / GM beat dispatch — see the split-out tickets named
  above.

## Files

| File            | Role                                                 |
| --------------- | ---------------------------------------------------- |
| `index.ts`      | `AutonomyScheduler` — the tick loop                  |
| `store.ts`      | `SimulationStore` — all `world_simulation_state` I/O |
| `types.ts`      | Pure shapes                                          |
| `index.test.ts` | Unit + integration coverage                          |
