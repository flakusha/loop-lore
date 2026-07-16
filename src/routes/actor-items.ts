/**
 * Actor Items Routes
 *
 * CRUD for per-actor inventory items.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { createEntityRoutes } from "./entity-routes";
import { EquipState } from "../db/enums";

export function actorItemsRoutes(opts: { database: Db; config: Config }): Elysia {
  return createEntityRoutes(
    {
      parentPrefix: "actors",
      entityPath: "items",
      entityName: "Item",
      tableName: "actor_items",
      parentFk: "actor_id",
      ownershipTable: "actors",
      ownershipFkColumn: "user_id",
      orderBy: [
        { column: "sort_order", dir: "asc" },
        { column: "created_at", dir: "desc" },
      ],
      filterField: { param: "type", column: "item_type" },
      fieldMappings: {
        name: "name",
        description: "description",
        itemType: "item_type",
        quantity: "quantity",
        value: "value",
        weight: "weight",
        tags: "tags",
        metadata: "metadata",
        equipped: "equipped",
        sortOrder: "sort_order",
      },
      jsonFields: ["tags", "metadata"],
      defaults: {
        itemType: "misc",
        quantity: 1,
        equipped: EquipState.Unequipped,
        sortOrder: 0,
      },
      createRequired: ["name"],
    },
    opts,
  );
}
