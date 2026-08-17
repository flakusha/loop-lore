// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import {
  type AbilityName,
  computeModifiers,
  defaultStatBlock,
  pointBuy,
  rollStats4d6,
  standardArray,
  type StatBlock,
  validateStatBlock,
} from "../../rpg/stats.js";
import {
  createCharacterStats,
  getCharacterStats,
  updateCharacterStats,
} from "../../rpg/service/character-stats.js";
import { checkRpgEnabled, } from "../../rpg/service/world-gate.js";
import { requireActorAccess, } from "../actor-auth";
import { jsonCreated, jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { type HandlerOpts,
  StatsBody,
  StatsCreateBody,
  StatsGenerateBody,
  StatsUpdateBody,
} from "./types";

/** Elysia context for actor-scoped routes (has params.actorId + auth fields). */
interface ActorCtx {
  params: { actorId: string };
  body: unknown;
  userId?: string | null;
  userRole?: string | null;
  t?: (key: string, ...args: unknown[]) => string;
}

/**
 * RPG Stats routes — calculate/validate/generate + per-actor CRUD.
 */
export function statsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const deps = { database, };

  return (
    new Elysia({ name: "rpg-stats", },)
      // ── Stats: Calculate ──────────────────────────────────
      .post(
        `${prefix}/rpg/stats/calculate`,
        (ctx: { body: unknown; userId?: string | null; t?: (k: string) => string },) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as { stats: StatBlock };
            const result = computeModifiers(body.stats,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate modifiers", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsBody,
          detail: {
            summary: "Compute ability modifiers",
            description: "Calculate modifier for each ability score using floor((stat-10)/2).",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .post(
        `${prefix}/rpg/stats/validate`,
        (ctx: { body: unknown; userId?: string | null; t?: (k: string) => string },) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as { stats: StatBlock };
            const valid = validateStatBlock(body.stats,);
            return jsonResponse({ valid, },);
          } catch (error) {
            log().error("Failed to validate stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsBody,
          detail: {
            summary: "Validate a stat block",
            description: "Check all six ability scores are within [1, 30].",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .post(
        `${prefix}/rpg/stats/generate`,
        (ctx: { body: unknown; userId?: string | null; t?: (k: string) => string },) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as {
              method: "point_buy" | "4d6_drop_lowest" | "standard_array";
              allocation?: Record<AbilityName, number>;
            };

            switch (body.method) {
              case "point_buy": {
                if (!body.allocation) {
                  return jsonError("Point-buy requires allocation", 400,);
                }
                const stats = pointBuy(body.allocation,);
                if (!stats) {
                  return jsonError("Invalid point-buy allocation (must total 27 points)", 400,);
                }
                return jsonResponse({ method: "point_buy", stats, },);
              }
              case "4d6_drop_lowest": {
                const rolls = rollStats4d6();
                const stats = defaultStatBlock();
                const abilities = ["str", "dex", "con", "int", "wis", "cha",] as const;
                for (let i = 0; i < 6; i++) {
                  stats[abilities[i]!] = rolls[i]!;
                }
                return jsonResponse({ method: "4d6_drop_lowest", stats, rolls, },);
              }
              case "standard_array": {
                return jsonResponse({ method: "standard_array", array: standardArray(), },);
              }
              default: {
                return jsonError("Unknown generation method", 400,);
              }
            }
          } catch (error) {
            log().error("Failed to generate stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsGenerateBody,
          detail: {
            summary: "Generate stat block",
            description: "Generate stats using point-buy, 4d6-drop-lowest, or standard array.",
            tags: ["RPG", "Stats",],
          },
        },
      )
      // ── Actor Stats: CRUD ─────────────────────────────────
      .get(
        `${prefix}/rpg/stats/:actorId`,
        async (ctx: ActorCtx,) => {
          const userId = await requireActorAccess(ctx, database,);
          if (typeof userId !== "string") { return userId; }

          try {
            const stats = await getCharacterStats(deps, ctx.params.actorId,);
            if (!stats) {
              return notFoundResponse("Character stats not found",);
            }
            return jsonResponse(stats,);
          } catch (error) {
            log().error("Failed to get character stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          detail: {
            summary: "Get character stats",
            description: "Retrieve RPG stats for an actor. Returns 404 if no stats exist.",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .post(
        `${prefix}/rpg/stats/:actorId`,
        async (ctx: ActorCtx & { query?: Record<string, string> },) => {
          const userId = await requireActorAccess(ctx, database,);
          if (typeof userId !== "string") { return userId; }

          try {
            // World-gate: if worldId provided, check RPG is enabled
            const worldId = ctx.query?.worldId;
            if (worldId) {
              const gate = await checkRpgEnabled(database, worldId,);
              if (!gate.allowed) {
                return jsonError(gate.reason ?? "RPG not enabled", 403,);
              }
            }

            const body = ctx.body as {
              hp: number;
              maxHp: number;
              ac: number;
              stats?: StatBlock;
              level?: number;
              mp?: number;
              maxMp?: number;
              speed?: number;
            };

            // Idempotency guard
            const existing = await getCharacterStats(deps, ctx.params.actorId,);
            if (existing) {
              return jsonError("Character stats already exist — use PATCH to update", 409,);
            }

            const statsId = await createCharacterStats(deps, {
              actorId: ctx.params.actorId,
              hp: body.hp,
              maxHp: body.maxHp,
              ac: body.ac,
              level: body.level,
              mp: body.mp,
              maxMp: body.maxMp,
              speed: body.speed,
              str: body.stats?.str,
              dex: body.stats?.dex,
              con: body.stats?.con,
              int: body.stats?.int,
              wis: body.stats?.wis,
              cha: body.stats?.cha,
            },);

            return jsonCreated({ id: statsId, actorId: ctx.params.actorId, },);
          } catch (error) {
            log().error("Failed to create character stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsCreateBody,
          detail: {
            summary: "Create character stats",
            description: "Initialize RPG stats for an actor. Returns 409 if stats already exist.",
            tags: ["RPG", "Stats",],
          },
        },
      )
      .patch(
        `${prefix}/rpg/stats/:actorId`,
        async (ctx: ActorCtx,) => {
          const userId = await requireActorAccess(ctx, database,);
          if (typeof userId !== "string") { return userId; }

          try {
            const body = ctx.body as Record<string, number | undefined>;

            const existing = await getCharacterStats(deps, ctx.params.actorId,);
            if (!existing) {
              return notFoundResponse("Character stats not found — use POST to create",);
            }

            const updated = await updateCharacterStats(deps, existing.id, {
              hp: body.hp,
              maxHp: body.maxHp,
              tempHp: body.tempHp,
              mp: body.mp,
              maxMp: body.maxMp,
              ac: body.ac,
              speed: body.speed,
              str: body.str,
              dex: body.dex,
              con: body.con,
              int: body.int,
              wis: body.wis,
              cha: body.cha,
              level: body.level,
              xp: body.xp,
              xpToNext: body.xpToNext,
            },);

            if (!updated) {
              return jsonError("No fields to update", 400,);
            }

            const refreshed = await getCharacterStats(deps, ctx.params.actorId,);
            return jsonResponse(refreshed,);
          } catch (error) {
            log().error("Failed to update character stats", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: StatsUpdateBody,
          detail: {
            summary: "Update character stats",
            description: "Partial update of RPG stats for an actor. Returns 404 if no stats exist.",
            tags: ["RPG", "Stats",],
          },
        },
      )
  );
}
