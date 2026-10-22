// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character stat allocation routes.
 *
 * GET /api/rpg/stat-allocation/:actorId — read allocation (404 if none)
 * PUT /api/rpg/stat-allocation/:actorId — validate + upsert allocation
 */

import { Elysia, t, } from "elysia";
import {
  AllocationValidationError,
  getStatAllocation,
  putStatAllocation,
} from "../../rpg/service/stat-allocation.js";
import { requireActorAccess, } from "../actor-auth.js";
import { jsonError, jsonResponse, notFoundResponse, } from "../http-utils.js";
import { log, } from "./log.js";
import { type HandlerOpts, StatBlockSchema, } from "./types.js";

/** Elysia context for actor-scoped routes. */
interface AllocationCtx {
  params: { actorId: string };
  body: unknown;
  userId?: string | null;
  userRole?: string | null;
  t?: (key: string, ...args: unknown[]) => string;
}

const StatAllocationBody = t.Object({
  worldId: t.String({ minLength: 1, },),
  stats: StatBlockSchema,
  traitIds: t.Array(t.String({ minLength: 1, },),),
},);

/**
 * Stat allocation routes — GET read, PUT validate + upsert.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function statAllocationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const deps = { database, };

  return new Elysia({ name: "rpg-stat-allocation", },)
    .get(
      `${prefix}/rpg/stat-allocation/:actorId`,
      async (ctx: AllocationCtx,) => {
        const userId = await requireActorAccess(ctx, database,);
        if (typeof userId !== "string") {
          return userId;
        }

        try {
          const allocation = await getStatAllocation(deps, ctx.params.actorId,);
          if (!allocation) {
            return notFoundResponse("Stat allocation not found",);
          }

          return jsonResponse(allocation,);
        } catch (error) {
          log().error("Failed to get stat allocation", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        detail: {
          summary: "Get stat allocation",
          description: "Retrieve allocated stats + traits for an actor. Returns 404 if none exist.",
          tags: ["RPG", "Stats",],
        },
      },
    )
    .put(
      `${prefix}/rpg/stat-allocation/:actorId`,
      async (ctx: AllocationCtx,) => {
        const userId = await requireActorAccess(ctx, database,);
        if (typeof userId !== "string") {
          return userId;
        }

        try {
          const body = ctx.body as {
            worldId: string;
            stats: Parameters<typeof putStatAllocation>[3];
            traitIds: string[];
          };

          const allocation = await putStatAllocation(
            deps,
            ctx.params.actorId,
            body.worldId,
            body.stats,
            body.traitIds,
            userId,
          );

          return jsonResponse(allocation,);
        } catch (error) {
          if (error instanceof AllocationValidationError) {
            return jsonError({ message: error.message, status: 422, data: { code: error.code, }, },);
          }

          log().error("Failed to put stat allocation", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        body: StatAllocationBody,
        detail: {
          summary: "Put stat allocation",
          description: "Validate against world config + catalog, then upsert. 422 on rule violation.",
          tags: ["RPG", "Stats",],
        },
      },
    );
}
