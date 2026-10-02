<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Autonomy Determinism

> Authoritative source is `src/autonomy/` and `src/rpg/npc-navigation/`.

## The rule

Every autonomy turn splits into two tiers.

**Deterministic tier** — scheduling, selection, ordering, budget
accounting. Byte-identical for the same persisted state plus the same
tick index. No RNG, no wall clock read inside the tier (the instant is
injected as `nowMs`).

**Nondeterministic tier** — LLM calls, wander/flee target choice,
jitter drop. Allowed to vary between runs, but every draw is routed
through a seedable RNG so a seeded world replays exactly.

The guarantee is **reproducibility, not sameness**. Two unseeded worlds
differ run to run by design; two runs of the same seeded world at the
same tick index draw identically. Where a source sits in a tier is a
design decision, not a fact about the code — a source that belongs in
the deterministic tier and is not there is a bug.

## Source classification

| Source | Where | Tier | Why |
| --- | --- | --- | --- |
| Due-world ordering | `src/autonomy/scheduler/store.ts` — `next_tick_at ASC, worlds.id ASC` | Deterministic | `world_id` is unique, so the order is total: two worlds can never tie and the dispatch sequence is byte-identical after a restart. |
| Cursor advance | `src/autonomy/scheduler/index.ts` — `#advance` | Deterministic | Arithmetic over the persisted `next_tick_at` and the injected `nowMs`; no clock read inside the turn. |
| Budget accounting | `src/autonomy/governor/` — persisted `window_count` | Deterministic | The count is read from and written to `autonomy_budget`; the window anchor is `window_start_at`, never the consume instant. |
| Error backoff | `src/autonomy/scheduler/index.ts` — `RETRY_BACKOFF_MS` | Deterministic | Fixed 5s offset, not sampled. The error text is not, but it is written to `last_error` and does not feed scheduling. |
| Jitter drop | `src/rpg/npc-navigation/tick-driver.ts` — `rng() < cfg.jitterRatio` | Nondeterministic, seedable | One Bernoulli draw per tick. Seeded by `deriveTickRng`. |
| Wander / flee target choice | `src/rpg/npc-navigation/service/processing.ts` — `Math.floor(opts.rng() * connections.length)` | Nondeterministic, seedable | One draw per wandering or fleeing NPC over its connected locations. `processMovementTick` takes `{ rng, nowMs }`, resolving `Math.random` / `Date.now` only when omitted; the tick driver forwards its already-resolved pair, so a seeded world replays the destination choice from the same stream as the jitter drop. Patrol and follow are not sampled at all — they follow a route index and a target's location, so they stay in the deterministic tier. |
| LLM dispatch | `src/story/game-master/`, BDI reflection | Nondeterministic, out of scope | Model sampling and prompt nondeterminism. Not seeded by this subsystem; the BDI and GM tickets own whether and how to make it seedable. |
| `BudgetCache` TTL | `src/autonomy/governor/cache.ts` | Excluded on purpose | See below. |

### Why the TTL cache is excluded

`BudgetCache` is invalidated by TTL only — never by the writer. A
cached `window_count` can therefore be stale for up to `ttlMs`, and
the cache's lifetime is the process: a restart drops it entirely.

The deterministic value is the **persisted** `window_count` in
`autonomy_budget`. The cache is a read optimization over that value,
not a source of truth, and TTL expiry is a property of wall-clock
arrival rather than of the turn. Making the cache part of the
deterministic contract would make replay depend on how many times a
SELECT was skipped, which is a performance concern, not a simulation
one. A cached read is at most stale against the same persisted row a
non-cached read would have returned.

## Where the seed lives

`AutonomyConfig.seed` and `PresetDefinition.seed`
(`src/autonomy/config/types.ts`), layered exactly like `jitterRatio`:
actor override > chat override > world override > preset baseline.

Every shipped preset carries `seed: null`. Unseeded is the production
default — organic worlds must stay varied, and a seeded built-in
preset would make them robotic.

Per-tick derivation (`src/autonomy/rng.ts`):

```ts
mulberry32(hashSeed(seed, worldId, tickIndex));
```

Per-tick rather than one shared stream per world: with a single shared
stream, every draw in a tick is coupled to the entire drop history
before it, so a jitter drop in tick 7 shifts every draw in tick 8 and a
tick can only be replayed as part of a full history. Deriving a fresh
stream per tick decouples them — a jitter drop in tick 7 cannot move a
single draw in tick 8, and replaying one tick in isolation is exact.

`deriveTickRng` with `seed: null` returns `Math.random` unchanged. That
is the production path and stays exactly as varied as it is today.
There is no global default seed: one would make every world in the
deployment replay identically and destroy the pseudoorganic pacing.

The derivation happens once per world-tick in `AutonomyScheduler`
(`src/autonomy/scheduler/index.ts`, `#tickWorld`), which passes the
stream on `AutonomyDispatchContext.rng` so every dispatch target on
that tick shares one. The tick index is `state.tick_count` — the tick
being computed, not the one just committed, so a replay of tick N
re-derives the stream tick N actually used. The constructor's `rng`
option overrides the derivation outright; it exists for tests that need
to pin draws without seeding the world.


## A failed tick replays identically

`#onWorldError` records `last_error` and backs the world off by
`RETRY_BACKOFF_MS` without advancing `tick_count`. The retry is
therefore tick N again, and tick N re-derives the same stream and burns
the same draws.

That is the guarantee, not a defect: a replay of a tick that failed must
reproduce that tick, including how it failed. Folding an attempt counter
into the tick index would make every retry draw differently, so a tick
could never be reproduced in isolation — the property per-tick derivation
exists to buy.

The practical consequence is that a crash whose cause is one specific draw
will not escape by retrying. `RETRY_BACKOFF_MS` bounds the rate; an
operator resolves the offending world or clears its `seed`. An unseeded
world has no such coupling, because its draws were never reproducible to
begin with.

## What this deliberately does not do

- **No snapshot/replay subsystem.** Persisted state is sufficient — a
  replay harness re-derives any tick from `seed` + `tickIndex`, so
  snapshotting RNG state would add machinery nothing reads. The repo
  recommends against building replay now.
- **No change to the persistence model.** The cursor in
  `world_simulation_state` remains the commit point; the tick count
  persisted there is the `tickIndex` fed to `deriveTickRng`.
- **No seeding of LLM output.** Out of scope for this subsystem; the
  BDI and GM tickets own it.

## Related

- `src/autonomy/scheduler/README.md` — due-world selection and dispatch
- `docs/spec/scheduler.md`
- `.plan/tickets/TASK-autonomy-deterministic-turns`
