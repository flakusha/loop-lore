# NPC Navigation — Tick Driver

Pure, scheduler-callable wrapper around `processMovementTick`. One call
== one scheduled tick. The driver owns no timers; the caller decides
when to invoke it.

## Pipeline

```
runNpcMovementTick(db, worldId, opts)
  ├─ paused?                       ──► skipped: "paused"
  ├─ resolveAutonomyConfig(db)     ──► skipped: "disabled"
  ├─ rng() < cfg.jitterRatio?      ──► skipped: "jitter"
  ├─ governor.tryConsume(per_tick) ──► skipped: "budget"
  └─ processMovementTick(db, w)    ──► { results, preset, jitterRatio }
```

Checks are cheapest-first so a paused world never touches DB.

## Usage

```ts
import { runNpcMovementTick, } from "../rpg/npc-navigation";

// Scheduler tick (pseudocode — actual scheduler is a separate ticket)
setInterval(async () => {
  const out = await runNpcMovementTick(db, worldId, {
    chatId: activeChatId,
    paused: world.paused, // caller's policy
    governor: sharedGovernor, // optional — shared across beats
  },);
  if ("results" in out) {
    log.info("moved", out.results.length, "npcs",);
  }
}, cfg.tickIntervalMs,);
```

## Options

| Field      | Type               | Default       | Purpose                          |
| ---------- | ------------------ | ------------- | -------------------------------- |
| `chatId`   | `string`           | `"__none__"`  | Governor cap scope resolution.   |
| `paused`   | `boolean`          | `false`       | Skip without DB / governor work. |
| `nowMs`    | `number`           | `Date.now()`  | Test determinism.                |
| `governor` | `AutonomyGovernor` | `new`         | Inject shared instance.          |
| `rng`      | `() => number`     | `Math.random` | Inject deterministic RNG.        |

## Result

```ts
type RunNpcMovementTickResult =
  | { skipped: "paused" }
  | { skipped: "disabled"; preset: string }
  | { skipped: "jitter"; jitterRatio: number }
  | { skipped: "budget"; reason: GovernorResult }
  | { results: MovementResult[]; preset: string; jitterRatio: number };
```

## Acceptance (from TASK-world-simulation-npc-navigation-tick-driver)

- ✅ Calls `processMovementTick(db, worldId)` once per scheduler tick.
- ✅ Jittered (configurable via `cfg.jitterRatio` from layered config).
- ✅ Governor denies on budget exhaustion — returns `skipped: "budget"`.
- ✅ No scheduler added here (P4 owns that).
- ✅ No new HTTP routes (manual route already exists).

## Jitter

Per-tick Bernoulli drop with `p = cfg.jitterRatio`. When the RNG draw
is below the ratio, the tick is skipped without touching NPC movement.
This prevents NPCs from moving in lockstep across multiple worlds
sharing the same scheduler beat.

Per-NPC sampling would give finer granularity but requires modifying
`processMovementTick` — out of scope for this ticket.

## Pause semantics

The driver accepts `opts.paused` from the caller. The caller decides
when a world is paused (e.g. by inspecting `worlds.publication_status`,
chat settings, or a per-world policy table). The driver stays pure.

## Files

- `tick-driver.ts` — driver implementation
- `tick-driver.test.ts` — cadence / jitter / pause / governor tests
