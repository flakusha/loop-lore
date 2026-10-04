// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/rpg/npc-navigation/tick-driver.ts — NPC movement tick driver
//
// Single-call wrapper around `processMovementTick` that:
//   1. Resolves the layered AutonomyConfig for the world.
//   2. Skips the tick when autonomy is disabled or the world is paused.
//   3. Gates dispatch through the AutonomyGovernor (per_tick_action).
//      The governor rejects when the per-tick budget is exhausted;
//      the driver returns `skipped: "budget"` and does NOT touch
//      movement.
//   4. Applies jitterRatio as a probabilistic tick-level skip — drop
//      a fraction of ticks at random so NPCs don't move in lockstep.
//      (ponytail: per-tick Bernoulli drop; per-NPC sampling would
//      require touching processMovementTick, owned by another ticket.)
//   5. Delegates to processMovementTick and returns its results.
//
// Pure function — no cron, no setInterval. The caller (scheduler P4
// or the manual HTTP route) decides when to invoke this. One call
// == one scheduled tick.
//
// Deterministic given `rng` and `nowMs` are injected; tests pin both.

import type { Kysely, } from "kysely";
import { resolveAutonomyConfig, } from "../../autonomy/config";
import type {
  AutonomyScope,
  GovernorLimitName,
  GovernorResult,
} from "../../autonomy/governor";
import { AutonomyGovernor, } from "../../autonomy/governor";
import type { DB, } from "../../db/schema";
import { processMovementTick, } from "./service/processing";
import type { MovementResult, } from "./service/types";

/** Limit the driver gates on. One consume per tick. */
const TICK_LIMIT: GovernorLimitName = "per_tick_action";

/** Scope identity passed to the governor. The driver is world-scoped
 *  (no actor or user identity of its own); we use a synthetic "world:"
 *  prefix so the budget row is clearly distinct from per-actor / per-
 *  user counters in `autonomy_budget`.
 *  ponytail: synthetic scope — a future per-world policy ticket can
 *  replace this with a real world scope if needed.
 */
function tickScope(worldId: string,): AutonomyScope {
  return { kind: "user", id: `world:${worldId}`, };
}

/** Options the caller passes to the driver. All optional fields have
 *  safe defaults; tests inject `governor`, `rng`, `nowMs`, `paused`.
 */
export interface RunNpcMovementTickOptions {
  /** Chat id for governor telemetry scoping. Required so the governor
   *  resolves the cap from the layered config (chat > world > preset).
   *  When omitted the resolver short-circuits on a sentinel id.
   */
  chatId?: string;
  /** When true, the driver skips without touching DB or governor. */
  paused?: boolean;
  /** Override `Date.now()` for deterministic tests. */
  nowMs?: number;
  /** Inject a pre-built governor (test fixtures / shared instance). */
  governor?: AutonomyGovernor;
  /** Inject an RNG for deterministic jitter. Defaults to Math.random. */
  rng?: () => number;
}

/** Result of one tick. `skipped` discriminates the four short-circuit
 *  outcomes; on a successful dispatch, `results` carries the movements.
 */
export type RunNpcMovementTickResult =
  | { skipped: "paused" }
  | { skipped: "disabled"; preset: string }
  | { skipped: "jitter"; jitterRatio: number }
  | { skipped: "budget"; reason: GovernorResult }
  | {
    results: MovementResult[];
    preset: string;
    jitterRatio: number;
  };

/**
 * Run one NPC movement tick.
 *
 * Order of checks (cheapest first):
 *   1. `opts.paused` → skip
 *   2. autonomy config (2–3 row SELECT) → skip when disabled
 *   3. jitter coin flip → skip when unlucky
 *   4. governor.tryConsume → skip when over budget
 *   5. processMovementTick (does the actual NPC work)
 *
 * @param db
 * @param worldId
 * @param opts
 * @returns {Promise<RunNpcMovementTickResult>}
 */
export async function runNpcMovementTick(
  db: Kysely<DB>,
  worldId: string,
  opts: RunNpcMovementTickOptions = {},
): Promise<RunNpcMovementTickResult> {
  if (opts.paused === true) {
    return { skipped: "paused", };
  }

  const nowMs = opts.nowMs ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const governor = opts.governor ?? new AutonomyGovernor();

  // chatId is required for the governor's config resolve; when missing
  // we still tick (the manual HTTP route has no chat context). Pass
  // a sentinel so the resolver short-circuits without a real lookup.
  const chatId = opts.chatId ?? "__none__";

  const cfg = await resolveAutonomyConfig(db, {
    worldId,
    chatId,
  },);

  if (!cfg.enabled) {
    return { skipped: "disabled", preset: cfg.preset, };
  }

  // Jitter: random uniform [0,1); skip when below jitterRatio.
  // ponytail: per-tick Bernoulli drop. Equivalent for NPC lockstep
  // prevention to per-NPC sampling when many NPCs share the tick.
  if (cfg.jitterRatio > 0 && rng() < cfg.jitterRatio) {
    return { skipped: "jitter", jitterRatio: cfg.jitterRatio, };
  }

  // The tick is billed to a `user`-scoped budget (the driver has no
  // actor identity of its own), so it must be charged perUserCap.
  // Passing perAgentCap here let a world tick past the per-user ceiling
  // entirely, and made the perUserCap setting dead for NPC movement.
  const gate = await governor.tryConsume(
    db,
    tickScope(worldId,),
    TICK_LIMIT,
    {
      cap: cfg.perUserCap,
      chatId,
      nowMs,
    },
  );

  if (!gate.ok) {
    return { skipped: "budget", reason: gate, };
  }

  const results = await processMovementTick(db, worldId,);
  return {
    results,
    preset: cfg.preset,
    jitterRatio: cfg.jitterRatio,
  };
}
