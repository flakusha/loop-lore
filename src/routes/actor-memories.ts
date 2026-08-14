/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor.
 */

import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { createEntityRoutes, } from "./entity-routes";

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
      },
      jsonFields: ["keywords",],
      defaults: {
        memoryType: "fact",
        confidence: 1,
        importance: 1,
      },
      createRequired: ["content",],
    },
    opts,
  );
}
