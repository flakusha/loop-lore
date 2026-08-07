/**
 * World Lore Entries Routes
 *
 * CRUD for per-world lorebook entries.
 * Uses custom ownership check via worlds table.
 */

import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { createEntityRoutes, } from "./entity-routes";

async function worldOwnershipCheck({
  database,
  parentId,
  userId,
  userRole,
  _entityId,
}: {
  database: Db;
  parentId: string;
  _entityId: string | null;
  userId: string | null;
  userRole: string | null;
},): Promise<boolean> {
  const db = database as any;
  const world = await db
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", parentId,)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin" && userRole !== "solo")) { return false; }

  const entityId = _entityId;
  if (entityId) {
    const entry = await db
      .selectFrom("world_lore_entries",)
      .select("id",)
      .where("id", "=", entityId,)
      .where("world_id", "=", parentId,)
      .executeTakeFirst();
    return !!entry;
  }
  return true;
}

export function worldLoreEntriesRoutes(opts: { database: Db; config: Config },): Elysia {
  return createEntityRoutes(
    {
      parentPrefix: "worlds",
      parentParam: "worldId",
      entityPath: "lore-entries",
      entityName: "Lore entry",
      tableName: "world_lore_entries",
      parentFk: "world_id",
      ownershipTable: "worlds",
      ownershipFkColumn: "owner_id",
      orderBy: [
        { column: "sort_order", dir: "asc", },
        { column: "insertion_order", dir: "asc", },
      ],
      fieldMappings: {
        name: "name",
        content: "content",
        keys: "keys",
        secondaryKeys: "secondary_keys",
        selective: "selective",
        caseSensitive: "case_sensitive",
        enabled: "enabled",
        constant: "constant",
        position: "position",
        insertionOrder: "insertion_order",
        priority: "priority",
        comment: "comment",
        sortOrder: "sort_order",
        audienceScope: "audience_scope",
      },
      jsonFields: ["keys", "secondary_keys", "audience_scope",],
      defaults: {
        selective: 0,
        caseSensitive: 0,
        enabled: "enabled",
        constant: 0,
        position: "before_char",
        insertionOrder: 100,
        priority: 100,
        sortOrder: 0,
      },
      createRequired: ["content",],
      checkOwnership: worldOwnershipCheck,
    },
    opts,
  );
}
