/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */

/**
 * World Lore Entries Routes
 *
 * CRUD for per-world lorebook entries.
 * Uses custom ownership check via worlds table.
 */

import { createEntityRoutes } from "./entity-routes";

createEntityRoutes({
  parentPrefix: "worlds",
  entityPath: "lore-entries",
  entityName: "Lore entry",
  tableName: "world_lore_entries",
  parentFk: "world_id",
  ownershipTable: "worlds",
  ownershipFkColumn: "owner_id",
  orderBy: [
    { column: "sort_order", dir: "asc" },
    { column: "insertion_order", dir: "asc" },
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
  },
  jsonFields: ["keys", "secondary_keys"],
  defaults: {
    selective: 0,
    caseSensitive: 0,
    enabled: 1,
    constant: 0,
    position: "before_char",
    insertionOrder: 100,
    priority: 100,
    sortOrder: 0,
  },
  createRequired: ["content"],
  checkOwnership: async ({ database: db, parentId: worldId, entityId, userId, userRole }) => {
    const d = db as any;
    const world = await d
      .selectFrom("worlds")
      .select("owner_id")
      .where("id", "=", worldId)
      .executeTakeFirst();
    if (!world || (world.owner_id !== userId && userRole !== "admin")) return false;

    if (entityId) {
      const entry = await d
        .selectFrom("world_lore_entries")
        .select("id")
        .where("id", "=", entityId)
        .where("world_id", "=", worldId)
        .executeTakeFirst();
      return !!entry;
    }
    return true;
  },
});
