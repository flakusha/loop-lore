# Autonomy Rate Governor

`src/autonomy/governor/` — pure module that gates every autonomous action
against configured per-actor / per-user caps.

## Use

```ts
import { AutonomyGovernor, } from "../autonomy";

const governor = new AutonomyGovernor();
const r = await governor.tryConsume(db, { kind: "actor", id: actorId, }, "per_minute_generation", {
  cap: cfg.perAgentCap,
  chatId,
  sessionId,
},);
if (!r.ok) { return; } // cap exceeded → skip
await doWork();
```

## Shape

| Limit                    | Window | Cap source    |
| ------------------------ | ------ | ------------- |
| `per_tick_action`        | 60s    | `perAgentCap` |
| `per_minute_generation`  | 60s    | `perAgentCap` |
| `per_hour_beat_dispatch` | 3600s  | `perUserCap`  |

Actor-scoped consumes consult `AutonomyConfig.perAgentCap`; user-scoped
consumes consult `perUserCap`. `null` = unbounded (skip DB, skip
telemetry) — unless the global kill switch (`AUTONOMY_KILL_SWITCH`) is
engaged, which denies every consume, including unbounded ones.

## Persistence

Every consume reads + writes the `autonomy_budget` table. New governor
instances (or fresh processes) read the same state. An in-memory cache
(`cacheTtlMs`, default 1000ms) avoids SELECT-per-consume inside the
same process.

## Telemetry

Emits `governor.budget.exceeded` on every denied consume. Fire-and-forget
— never blocks the gate decision. Payload includes `scope_kind`,
`scope_id`, `limit_name`, `cap`, `window_count`, `window_reset_at`,
`timestamp`. Kill-switch denials carry `kill_switch: true` with
`cap: 0` and `window_count: 0`.

## Cost ledger

`spendForActor(db, { actorId })` sums an actor's in-window consumes
across its `autonomy_budget` rows (per-limit `counts` plus `total`). No
new table: the budget rows already carry per-actor spend, so the ledger
folds them with the governor's own window arithmetic. Denied consumes
(budget or kill switch) never write rows, so the ledger only reflects
allowed work.

## Constraints

- NOT a process singleton — instantiate per scheduler / tick-driver.
- Caller is the source of truth for cap values. The governor never
  mutates cap values autonomously.
- Every bypass-resistance test verifies there is no path to advance
  the budget without going through `tryConsume`.
