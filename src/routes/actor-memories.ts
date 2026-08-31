// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor.
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
export function actorMemoriesRoutes(opts: { database: Db; config: Config },): Elysia {
  return createEntityRoutes(
    {
      parentPrefix: "actors",
      parentParam: "actorId",
      entityPath: "memories",
      entityName: "Memory",
      tableName: "actor_memories",
      parentFk: "actor_id",
      ownershipTable: "actors",
      ownershipFkColumn: "user_id",
      orderBy: [
        { column: "importance", dir: "desc", },
        { column: "created_at", dir: "desc", },
      ],
      filterField: { param: "type", column: "memory_type", },
      fieldMappings: {
        content: "content",
        memoryType: "memory_type",
        confidence: "confidence",
        importance: "importance",
        keywords: "keywords",
        sourceChatId: "source_chat_id",
        expiresAt: "expires_at",
        pinned: "pinned",
        scope: "scope",
      },
      jsonFields: ["keywords",],
      defaults: {
        memoryType: "fact",
        confidence: 1,
        importance: 1,
        pinned: "unpinned",
      },
      createRequired: ["content",],
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
