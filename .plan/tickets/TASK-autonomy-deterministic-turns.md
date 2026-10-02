<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Deterministic and non-deterministic autonomy turns

**Status:** Done
**Priority:** high
**Effort:** Medium (design draft below; seeding the movement RNG is the bulk)
**Summary:** Decide, document, and implement how the autonomy scheduler separates the parts of a turn that must be reproducible from the parts that are allowed to vary, so a world can be replayed exactly for debugging while still running organically in production.
**Context:** The scheduler README (`src/autonomy/scheduler/README.md:56-60`) claims the due-world dispatch order is "byte-identical after a process restart", and `store.ts:71` implements it as `ORDER BY next_tick_at ASC, worlds.id ASC`. That claim is true but narrow: it covers **which worlds are selected and in what order**, not **what a turn does**. Three nondeterminism sources sit inside a tick today and none of them are seeded. There is no seed field in `AutonomyConfig` (`src/autonomy/config/types.ts:30-43`), and no document in `docs/` states a determinism rule for autonomy.

**Acceptance Criteria:**
- [ ] `docs/spec/autonomy-determinism.md` states the rule below and is linked from the autonomy scheduler README.
- [ ] Every nondeterminism source in a tick is enumerated and classified deterministic or not.
- [ ] `processMovementTick` takes an injected RNG; the two bare `Math.random()` calls at `src/rpg/npc-navigation/service/processing.ts:160,246` are removed.
- [ ] A seeded run and an unseeded run of the same world produce identical results and provably different ones respectively.
- [ ] The governor's TTL cache is excluded from the determinism contract (see §4).
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, determinism, replay, scheduler, rng, seed
**Related:** TASK-story-auto-drive-scheduler, TASK-autonomy-rate-governor, epic-actor-autonomy-story-drive.md:110-121

## Design draft

### 1. The rule

Split every turn into two tiers. The tier is a property of the *call site*,
not of the value it produces.

| Tier | Meaning | Guarantee |
| --- | --- | --- |
| **Deterministic** | Scheduling, selection, ordering, budget accounting | Byte-identical for the same persisted state + same tick index |
| **Nondeterministic** | LLM calls, wander/flee target choice, jitter drop | Allowed to vary; must be *seedable* so it can be pinned when debugging |

The guarantee is **reproducibility, not sameness**: a seeded run must
replay exactly; an unseeded run is free to differ. Nothing in the
product requires organic worlds to be identical across runs — that is
the point of `jitterRatio`.

### 2. What is already deterministic — keep it

Verified in source, not assumed:

- **Due-world selection and order.** `store.ts:71,96` orders by
  `next_tick_at ASC, worlds.id ASC`. `worlds.id` is unique, so the order
  is total and a restart cannot reorder a given cursor set. This is the
  property the README claims and it holds.
- **Cursor advance.** `index.ts:206` computes `next_tick_at` from the
  injected `nowMs` plus the resolved `tickIntervalMs`; no wall clock read
  inside the loop.
- **Budget accounting.** `autonomy_budget` rows are persisted and
  `window_count` is incremented in the DB, so the count survives a
  restart regardless of the cache.
- **Error handling.** `#onWorldError` (`index.ts:224-247`) backs the
  world off by a fixed `RETRY_BACKOFF_MS`, so a failure does not perturb
  the sequence.

### 3. What is not deterministic — the actual work

**(a) Wander and flee target choice.** The largest gap.
`processing.ts:160` and `:246` call `Math.random()` **directly**, so the
`rng` that `AutonomyScheduler` already threads
(`index.ts:72,78,183` → `tick-driver.ts:108,128`) never reaches the code
that actually picks a destination. Seeding the scheduler alone would
change jitter but leave movement identical — a trap for anyone who assumes
the injection is already end-to-end. `processMovementTick` must accept an
`rng: () => number` parameter and use it at both call sites.

**(b) Jitter drop.** `tick-driver.ts:128` uses the injected `rng`
already; once the seed spans both consumers one stream suffices. Note
the interaction: a jitter drop consumes a draw, so the *number* of draws
depends on the drop history. A seeded replay therefore needs the same
tick index, not just the same seed.

**(c) LLM-backed dispatch (BDI, GM beats).** Inherently
nondeterministic and out of scope to seed — an LLM does not replay. These
land under `TASK-bdi-plan-recompute-implementation` and
`TASK-gm-beat-scheduling`. They must be dispatched **after** the
deterministic tier and must not feed back into selection, or determinism
is lost for the whole loop.

### 4. What must stay nondeterministic — the cache

`BudgetCache` (`cache.ts:30-99`) is a per-process TTL read-through
cache. It is **excluded from the determinism contract on purpose**:

- It is invalidated by TTL only, never by the writer (`cache.ts:6-9`),
  so a cached `window_count` can be stale for up to `ttlMs`.
- Its lifetime is the process, so it is empty after a restart.

Making it deterministic would mean either flushing on every write
(losing the SELECT saving the cache exists for) or pinning the clock
(`tryConsume` derives its window from `nowMs`, but the cache is also
consulted by the non-test `peek` path). Excluding it is the honest call:
**the persisted `window_count` is the deterministic value; the cache is
a read optimization whose staleness window is bounded and documented.**
If a future ticket needs exact budget replay, it must disable the cache
rather than trust it.

### 5. Where the seed lives

Add `seed: number | null` to `AutonomyConfig` and `PresetDefinition`
(`config/types.ts:30-43`, `config/presets.ts:23-48`). `null` means
unseeded — the production default, and what keeps organic worlds varied.
A non-null seed derives a per-tick stream rather than one global stream:

```
rng(tickIndex) = mulberry32(hash(seed, worldId, tickIndex))
```

Deriving per tick rather than sharing one stream is what makes §3(b)
work: a jitter drop in tick 7 cannot shift the draws in tick 8, so a
replay of tick 8 alone is still exact. One shared stream would couple
every tick to the entire drop history before it.

The scheduler holds the seed and passes the derived `rng` down; the tick
driver forwards it to `processMovementTick`. No new global, no new
singleton.

### 6. What this deliberately does not do

- **No snapshot/replay subsystem.** `docs/research/db-recovery-via-jsonl-log-replay.md:64`
  already recommends "do not build replay now". A seed plus a cursor is
  enough to reproduce a single world; a full log-replay is a different,
  larger thing.
- **No change to the persistence model.** The cursor in
  `world_simulation_state` remains the commit point.
- **No seeding of LLM output.** Non-deterministic by nature; the BDI and
  GM tickets own that problem instead.


git issue: adb5001

**Resolved:** 2026-10-02 registry-driven close: git issue adb5001 (registry tip: 9e05a7a4a Konstantin Fedotov Auto-closed: appended .md marker marks TASK-AUTONOMY-DETERMINISTIC-TURN)
