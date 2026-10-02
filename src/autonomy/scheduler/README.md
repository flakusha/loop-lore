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

const scheduler = new AutonomyScheduler(db,);

// Real-time / accelerated / manual sources all reduce to this:
setInterval(() => {
  void scheduler.tickOnce();
}, 1_000,);

await scheduler.pause(worldId,); // admin pause
await scheduler.stepOnce(worldId,); // step one action (works while paused)
await scheduler.resume(worldId,); // admin resume
const state = await scheduler.stateFor(worldId,);
```

Constructor takes the Kysely handle plus optional
`{ governor, rng, dispatch }`. `governor` shares a `AutonomyGovernor`
across the tick driver. `rng` is a test seam: it overrides the
per-tick derived stream for every world, so a test can pin the
jitter coin flip without seeding the world. Omit it in production —
the scheduler derives the stream from the config seed itself.

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
only — not what a turn does. Every turn is split into a deterministic
tier (scheduling, selection, ordering, budget accounting) and a
nondeterministic tier (jitter drop, wander/flee target choice, LLM
dispatch). The guarantee is reproducibility, not sameness: the seed
lives at `AutonomyConfig.seed` (`null` = unseeded, the production
default) and each tick draws from its own stream,
`mulberry32(hashSeed(seed, worldId, tickIndex))`, derived once in
`#tickWorld` from the world's `tick_count` — the tick being computed,
not the one just committed — and shared by every target on that tick —
so a jitter drop in one tick cannot shift the next tick's draws, and
one tick replays in isolation. `seed: null` (every shipped preset)
derives `Math.random`, so the unseeded production path is unchanged.
The RNG reaches the movement path through `runNpcMovementTick`'s
`rng` option, which spends the tick's first draw on the jitter coin
flip. Full source table, the seed's layering, and why the governor's
TTL cache is excluded:
[autonomy determinism](../../../docs/spec/autonomy-determinism.md).

## Dispatch

The scheduler owns **no dispatch logic of its own**. Per due world it
resolves cadence from the layered `AutonomyConfig`, builds one
`AutonomyDispatchContext` (`db`, `worldId`, `chatId`, `nowMs`, `cfg`,
`rng`, optional shared `governor`), runs every registered dispatch
target over it, and aggregates what they report. The scheduler never
moves an NPC, never plans a GM beat, never recomputes a BDI plan — it
only runs the list and folds the results.

`movementDispatch` (wrapping `runNpcMovementTick`,
`src/rpg/npc-navigation/tick-driver.ts`) is registered **first in every
scheduler**, so `new AutonomyScheduler(db)` is movement-only and its
behaviour is unchanged by anything that follows.

A new subsystem registers by implementing `AutonomyDispatch` — a
`name` plus `run(ctx)` returning `{dispatched: n}` or `{skipped: why}`
— and passing it as `dispatch: [...]` to the constructor:

```ts
new AutonomyScheduler(db, { dispatch: [bdiReflection, gmBeats,], },);
```

Nothing in the tick loop changes. Two properties the seam guarantees:

- **A skip never aborts the tick.** A GM beat that is off-cadence does
  not stop NPC movement. `aggregate()` sums dispatched work across
  targets and reports `dispatched` whenever at least one target
  returned `dispatched` — including a target that did zero work, since
  it did run. Only an all-skip tick reports a reason: the first in
  registration order.
- **Each target charges its own governor.** The scheduler hands over
  the governor instance but never calls `tryConsume` itself, so a
  target cannot double-spend — `movementDispatch`'s charge stays inside
  `runNpcMovementTick` (`TICK_LIMIT`). Targets own their own gating.

A target that throws propagates to `#tickWorld`, which records the
error on the world's row, backs the world off, and counts it in
`TickResult.errors` — one broken target cannot stall the loop. A
short-circuit (e.g. the driver's `disabled`, `jitter`, `budget`) is
recorded as the outcome but the cursor still advances, so a
budget-denied world is rescheduled rather than dropped or re-selected
on every pass.

BDI reflection and GM beat dispatch are **split out**, not deferred:
`TASK-bdi-plan-recompute-implementation` and
`TASK-gm-beat-scheduling`. They are **implemented as separate dispatch
targets** — separate budgets, separate short-circuit reasons, separate
failures — rather than folded into the movement path, because neither
could ride along inside it without double-moving NPCs (GM) or authoring
the decision layer from scratch (BDI). See the split-out ACs in
`.plan/tickets/TASK-story-auto-drive-scheduler.md`.

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
