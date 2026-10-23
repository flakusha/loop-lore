// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gameplay trait catalog routes.
 *
 * GET /api/rpg/trait-catalog?worldId=… — scoped trait list for the picker
 */

import { Elysia, t, } from "elysia";
import { getTraitsForWorld, } from "../../rpg/traits/catalog.js";
import { jsonResponse, requireUserId, } from "../http-utils.js";
import type { HandlerOpts, } from "./types.js";

/** Elysia context for the catalog route. */
interface CatalogCtx {
  query?: { worldId?: string };
  userId?: string | null;
  userRole?: string | null;
}

/**
 * Trait catalog route — world-scoped list for the allocation picker.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function traitCatalogRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "rpg-trait-catalog", },).get(
    `${prefix}/rpg/trait-catalog`,
    async (ctx: CatalogCtx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") {
        return userId;
      }

      void database;

      const worldId = ctx.query?.worldId ?? "";
      const traits = getTraitsForWorld(worldId,).map((trait,) => ({
        ...trait,
        scope: trait.worldIdScope === "*" ? ("universal" as const) : ("world" as const),
      }));

      return jsonResponse(traits,);
    },
    {
      query: t.Object({ worldId: t.Optional(t.String(),), },),
      detail: {
        summary: "List gameplay traits",
        description: "Traits applying to a world (universal + scoped).",
        tags: ["RPG", "Stats",],
      },
    },
  );
}
