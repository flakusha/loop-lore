// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Production `PlanRecomputeFn` for the BDI nightly reflection cycle.
 *
 * Backed by the real generation pipeline (`callLlm`), not a stub: the
 * prompt is assembled from the rows the DB actually holds — npc_states,
 * the actor's location, its world, its previous plan — and the model is
 * asked for one dated JSON object (see ./bdi-plan-shape.ts).
 *
 * Degradation is the contract, not an edge case. This function never
 * throws: the nightly cycle is fire-and-forget per actor, so one actor's
 * unreachable provider or unusable output must not strand the rest.
 *
 * @module services/agency/bdi-plan-recompute
 */

import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import { callLlm, } from "../../generation/auto-gen/call-llm";
import { createDefaultDeps, } from "../../generation/auto-gen/deps";
import type { GenerationMessage, } from "../../generation/gen-types-options";
import { resolveProvider, } from "../../generation/providers/registry";
import { createLogger, getLogger, } from "../../logger";
import { jsonParseOr, } from "../../utils";
import type { PlanRecomputeFn, } from "./bdi-nightly";
import type { DailyPlan, PlanFacts, } from "./bdi-plan-shape";
import { buildPlanPrompt, fallbackPlan, MAX_ACTIVITIES, parsePlan, } from "./bdi-plan-shape";

// Lazy logger init — module body must not throw when the global logger has
// not been initialized yet (e.g. direct module import in tests).
try {
  getLogger();
} catch {
  createLogger({ level: "error", },);
}
const log = getLogger().child({ module: "agency/bdi-plan-recompute", },);

/** Chat id handed to `callLlm`. Nothing in the cycle is chat-scoped — no
 *  buffer, no parent message, no user intent to classify — so this is the
 *  resolver's sentinel, not a fake chat lookup. */
const NO_CHAT = "__none__";

/** One text-generation call. The default goes through `callLlm`; tests
 *  inject a stub so the parse/fallback paths are reachable offline. */
export type PlanTextGenerator = (req: {
  actorId: string;
  actorName: string;
  messages: GenerationMessage[];
}) => Promise<string>;

export interface PlanRecomputeOptions {
  db: Kysely<DB>;
  /** Server config. Defaults to `loadConfig()`. */
  config?: Config;
  /** LLM seam. Defaults to the real `callLlm` pipeline. */
  generate?: PlanTextGenerator;
  /** Activity cap per plan. Defaults to {@link MAX_ACTIVITIES}. */
  maxActivities?: number;
}

/**
 * Build the production plan generator.
 * @param opts
 * @returns a `PlanRecomputeFn`, assignable to the nightly cycle's slot
 *   with no cast
 */
export function createPlanRecompute(opts: PlanRecomputeOptions,): PlanRecomputeFn {
  const { db, config, generate, maxActivities = MAX_ACTIVITIES, } = opts;
  const text = generate ?? callLlmGenerator({ db, config, },);
  return async (actorId: string, worldId: string | undefined, today: string,): Promise<DailyPlan> => {
    let facts: PlanFacts | null = null;
    try {
      facts = await loadFacts(db, actorId, worldId,);
      const raw = await text({ actorId, actorName: facts.actorName, messages: buildPlanPrompt(facts, today,), },);
      const parsed = parsePlan(raw, maxActivities,);
      if (parsed === null) {
        log.warn("bdi plan: unusable model output — using state-derived fallback", {
          actorId,
          planDate: today,
          contentLength: raw.length,
        },);
        return fallbackPlan(facts,);
      }
      return parsed;
    } catch (error) {
      log.error(
        "bdi plan: recompute failed — using state-derived fallback",
        error instanceof Error ? error : undefined,
        { actorId, planDate: today, },
      );
      return fallbackPlan(facts,);
    }
  };
}

/** Default generator: resolve the provider, then the canonical LLM helper. */
function callLlmGenerator(args: { db: Kysely<DB>; config?: Config },): PlanTextGenerator {
  return async (req,) => {
    const config = args.config ?? loadConfig();
    const resolved = await resolveProvider({ config, db: args.db, },);
    const llm = await callLlm({
      d: createDefaultDeps(),
      database: args.db,
      config,
      chatId: NO_CHAT,
      parentMessageId: null,
      resolved,
      prompt: { messages: req.messages, },
      actorName: req.actorName,
      // Never stream: nothing renders this text, and a silent non-stream
      // call is what the production caller actually wants.
      chatStreaming: 0,
    },);
    return llm.content;
  };
}

async function loadFacts(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | undefined,
): Promise<PlanFacts> {
  const actor = await db
    .selectFrom("actors",)
    .select("display_name",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  const world = worldId === undefined
    ? undefined
    : await db.selectFrom("worlds",).select("name",).where("id", "=", worldId,).executeTakeFirst();
  const npc = await db
    .selectFrom("npc_states",)
    .leftJoin("locations", "locations.id", "npc_states.location_id",)
    .select([
      "npc_states.location_id",
      "npc_states.health",
      "npc_states.mental_state",
      "npc_states.schedule",
      "locations.name as location_name",
    ],)
    .where("npc_states.actor_id", "=", actorId,)
    .where("npc_states.world_id", "=", worldId ?? "",)
    .executeTakeFirst();
  const prev = await db
    .selectFrom("actor_daily_plans",)
    .select(["summary", "priority",],)
    .where("actor_id", "=", actorId,)
    .orderBy("plan_date", "desc",)
    .executeTakeFirst();
  const schedule = jsonParseOr<Record<string, unknown>>(npc?.schedule ?? "{}", {},);
  return {
    actorName: actor?.display_name ?? actorId,
    worldName: world?.name ?? null,
    locationId: npc?.location_id ?? null,
    locationName: npc?.location_name ?? null,
    health: npc?.health ?? null,
    mentalState: npc?.mental_state ?? null,
    movementPattern: typeof schedule.movementPattern === "string" ? schedule.movementPattern : null,
    prevSummary: prev?.summary ?? null,
    prevPriority: prev?.priority ?? null,
  };
}
