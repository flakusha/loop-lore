/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor.
 */

import { createEntityRoutes } from "./entity-routes";

createEntityRoutes({
  parentPrefix: "actors",
  entityPath: "memories",
  entityName: "Memory",
  tableName: "actor_memories",
  parentFk: "actor_id",
  ownershipTable: "actors",
  ownershipFkColumn: "user_id",
  orderBy: [
    { column: "importance", dir: "desc" },
    { column: "created_at", dir: "desc" },
  ],
  filterField: { param: "type", column: "memory_type" },
  fieldMappings: {
    content: "content",
    memoryType: "memory_type",
    confidence: "confidence",
    importance: "importance",
    keywords: "keywords",
    sourceChatId: "source_chat_id",
    expiresAt: "expires_at",
  },
  jsonFields: ["keywords"],
  defaults: {
    memoryType: "fact",
    confidence: 1,
    importance: 1,
  },
  createRequired: ["content"],
});
