// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ItemVisibility, } from "../../db/enums";
import { rankItemPower, } from "../../story/items/balance";
import type { ItemDefinition, ItemInstance, } from "../../story/items/types";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import { ErrorResponse, WorldIdParams, } from "../../validation/schemas";
import {
  ErrorCode,
  extractAuth,
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Default rows returned when the caller does not ask for a specific top-N. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/**
 * Parse `?limit=` into a clamped top-N. A non-numeric or non-positive value
 * falls back to the default rather than failing the request.
 * @param raw
 */
function parseLimit(raw: string | null,): number {
  if (raw === null) { return DEFAULT_LIMIT; }
  const parsed = Number.parseInt(raw, 10,);
  if (!Number.isFinite(parsed,) || parsed <= 0) { return DEFAULT_LIMIT; }
  return Math.min(parsed, MAX_LIMIT,);
}

/**
 * Admin item power audit routes.
 *
 * GET /api/admin/worlds/:id/items/power-audit — top-N most powerful
 * world items in a world, ranked by
 * `(maxStatDelta + sum(drift) + maxDurability)`.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function itemPowerRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-item-power", },)
      .get(
        `${prefix}/admin/worlds/:id/items/power-audit`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id: worldId, } = ctx.params as { id: string };

          const url = new URL(ctx.request.url,);
          const limit = parseLimit(url.searchParams.get("limit",),);

          const rows = await opts.database
            .selectFrom("world_items",)
            .innerJoin("items", "items.id", "world_items.item_id",)
            .select([
              "world_items.id as worldItemId",
              "world_items.item_id as itemId",
              "world_items.properties as instanceProperties",
              "world_items.max_durability as maxDurability",
              "items.name",
              "items.category",
              "items.rarity",
              "items.properties as definitionProperties",
            ],)
            .where("world_items.world_id", "=", worldId,)
            .execute();

          const definitionById = new Map<string, ItemDefinition>(rows.map((row,) => [
            row.itemId,
            {
              worldId,
              name: row.name,
              description: "",
              category: row.category,
              rarity: row.rarity,
              stackable: false,
              maxStack: 1,
              properties: jsonParseOr<Record<string, unknown>>(row.definitionProperties, {},),
              value: 0,
              weight: 0,
            },
          ]),);

          const instances: ItemInstance[] = rows.map((row,) => ({
            worldItemId: row.worldItemId,
            itemId: row.itemId,
            name: row.name,
            description: "",
            category: row.category,
            rarity: row.rarity,
            visibility: ItemVisibility.Visible,
            quantity: 1,
            properties: jsonParseOr<Record<string, unknown>>(row.instanceProperties, {},),
            value: 0,
            weight: 0,
            maxDurability: row.maxDurability,
          }));

          return jsonResponse({ worldId, limit, items: rankItemPower(definitionById, instances,).slice(0, limit,), },);
        },
        { params: WorldIdParams, response: { 200: t.Any(), 403: ErrorResponse, }, },
      )
  );
}
