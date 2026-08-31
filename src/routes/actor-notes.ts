// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Notes Routes
 *
 * CRUD for per-actor reference notes.
 */

import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { createEntityRoutes, } from "./entity-routes";

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 */
export function actorNotesRoutes(opts: { database: Db; config: Config },): Elysia {
  return createEntityRoutes(
    {
      parentPrefix: "actors",
      parentParam: "actorId",
      entityPath: "notes",
      entityName: "Note",
      tableName: "actor_notes",
      parentFk: "actor_id",
      ownershipTable: "actors",
      ownershipFkColumn: "user_id",
      orderBy: [
        { column: "pinned", dir: "desc", },
        { column: "sort_order", dir: "asc", },
        { column: "created_at", dir: "desc", },
      ],
      filterField: { param: "category", column: "category", },
      fieldMappings: {
        title: "title",
        content: "content",
        category: "category",
        pinned: "pinned",
        sortOrder: "sort_order",
      },
      jsonFields: [],
      defaults: {
        category: "general",
        pinned: "unpinned",
        sortOrder: 0,
      },
      createRequired: ["title", "content",],
      valueTransforms: {
        pinned: (value,) => (value === true || value === "pinned" ? "pinned" : "unpinned"),
      },
      responseTransforms: {
        pinned: (value,) => value === "pinned",
      },
    },
    opts,
  );
}
