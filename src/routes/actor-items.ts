/**
 * Actor Items Routes
 *
 * CRUD for per-actor inventory items.
 */

import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { EquipState, } from "../db/enums";
import { createEntityRoutes, } from "./entity-routes";
import { actorItemsGameplayRoutes, } from "./actor-items/service";

export function actorItemsRoutes(opts: { database: Db; config: Config },): Elysia {
  const crud = createEntityRoutes(
    {
      parentPrefix: "actors",
      parentParam: "actorId",
      entityPath: "items",
      entityName: "Item",
      tableName: "actor_items",
      parentFk: "actor_id",
      ownershipTable: "actors",
      ownershipFkColumn: "user_id",
      orderBy: [
        { column: "sort_order", dir: "asc", },
        { column: "created_at", dir: "desc", },
      ],
      filterField: { param: "type", column: "item_type", },
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
      jsonFields: ["tags", "metadata",],
      defaults: {
        itemType: "misc",
        quantity: 1,
        equipped: EquipState.Unequipped,
        sortOrder: 0,
      },
      createRequired: ["name",],
    },
    opts,
  );
  return crud.use(actorItemsGameplayRoutes(opts,),) as unknown as Elysia;
}
