// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stats — per-actor CRUD routes.
 *
 * GET  /api/rpg/stats/:actorId — retrieve stats (404 if none)
 * POST /api/rpg/stats/:actorId — create stats (409 if exists)
 * PATCH /api/rpg/stats/:actorId — partial update (404 if none)
 */

import { Elysia, } from "elysia";
import {
  createCharacterStats,
  getCharacterStats,
  updateCharacterStats,
} from "../../rpg/service/character-stats.js";
import { checkMechanicEnabled, checkRpgEnabled, RpgMechanic, } from "../../rpg/service/world-gate.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { requireActorAccess, } from "../actor-auth.js";
import { jsonCreated, jsonError, jsonResponse, notFoundResponse, } from "../http-utils.js";
import { log, } from "./log.js";
import { type HandlerOpts, StatsCreateBody, StatsUpdateBody, } from "./types.js";

/** Elysia context for actor-scoped routes. */
interface ActorCtx {
  params: { actorId: string };
  body: unknown;
  userId?: string | null;
  userRole?: string | null;
  t?: (key: string, ...args: unknown[]) => string;
}

/**
 * Per-actor stats routes — GET/POST/PATCH for character stats.
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { rpg: { stats: { ":actorId": { ...; }; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function statsActorRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const deps = { database, };

  return (
    new Elysia({ name: "rpg-stats-actor", },)
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
            const body = ctx.body as Record<string, number | string | undefined>;
            const existing = await getCharacterStats(deps, ctx.params.actorId,);
            if (!existing) {
              return notFoundResponse("Character stats not found — use POST to create",);
            }

            // Per-world rpg_xp opt-in (FEAT-gate-xp): direct writes to the
            // pipeline-owned level/xp/xpToNext fields need an opted-in world.
            // The gate rides an explicit worldId body field (the stats row
            // itself carries no world); without one the fields stay
            // read-only and a 403 names the requirement.
            const wantsXpFields = body.level !== undefined || body.xp !== undefined || body.xpToNext !== undefined;
            if (wantsXpFields) {
              const worldId = typeof body.worldId === "string" ? body.worldId : undefined;
              if (!worldId) {
                return jsonError("level/xp/xpToNext require an opted-in worldId", 403,);
              }

              const gate = await checkMechanicEnabled(database, worldId, RpgMechanic.Xp,);
              if (!gate.allowed) {
                return jsonError(gate.reason ?? "RPG XP not enabled for this world", 403,);
              }
            }

            const updated = await updateCharacterStats(deps, existing.id, {
              hp: body.hp as number | undefined,
              maxHp: body.maxHp as number | undefined,
              tempHp: body.tempHp as number | undefined,
              mp: body.mp as number | undefined,
              maxMp: body.maxMp as number | undefined,
              ac: body.ac as number | undefined,
              speed: body.speed as number | undefined,
              str: body.str as number | undefined,
              dex: body.dex as number | undefined,
              con: body.con as number | undefined,
              int: body.int as number | undefined,
              wis: body.wis as number | undefined,
              cha: body.cha as number | undefined,
              level: body.level as number | undefined,
              xp: body.xp as number | undefined,
              xpToNext: body.xpToNext as number | undefined,
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
            description:
              "Partial update of RPG stats for an actor (level/xp/xpToNext are pipeline-owned). Returns 404 if no stats exist.",
            tags: ["RPG", "Stats",],
          },
        },
      )
  );
}
