/**
 * Actor Lore Entries Routes
 *
 * CRUD for per-actor lorebook entries (character_book).
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { createEntityRoutes } from "./entity-routes";

export function actorLoreEntriesRoutes(opts: { database: Db; config: Config }): Elysia {
  return createEntityRoutes(
    {
      parentPrefix: "actors",
      entityPath: "lore-entries",
      entityName: "Lore entry",
      tableName: "actor_lore_entries",
      parentFk: "actor_id",
      ownershipTable: "actors",
      ownershipFkColumn: "user_id",
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
    },
    opts,
  );
}
