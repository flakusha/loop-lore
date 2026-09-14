// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor.
 */

import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { expandMemoryContext, } from "../memory/history-search";
import { parseIntOr, } from "../utils/parse-number";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { createEntityRoutes, } from "./entity-routes";
import { checkOwnership, entityPaths, } from "./entity-routes/context";
import { jsonResponse, } from "./http-utils";

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 */
export function actorMemoriesRoutes(opts: { database: Db; config: Config },): Elysia {
  const entityConfig = {
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
      sourceMessageIds: "source_message_ids",
      sourceChatIds: "source_chat_ids",
      extractionKind: "extraction_kind",
      expiresAt: "expires_at",
      pinned: "pinned",
      scope: "scope",
    },
    jsonFields: ["keywords", "sourceMessageIds", "sourceChatIds",],
    defaults: {
      memoryType: "fact",
      confidence: 1,
      importance: 1,
      pinned: "unpinned",
    },
    createRequired: ["content",],
    valueTransforms: {
      pinned: (value: unknown,) => (value === true || value === "pinned" ? "pinned" : "unpinned"),
    },
    responseTransforms: {
      pinned: (value: unknown,) => value === "pinned",
    },
  } as const;
  const { withIdPath, parentParam, } = entityPaths(entityConfig as never,);

  const expandRoute = new Elysia({ name: "memories-expand", },)
    .get(`${withIdPath}/expand`, async (ctx,) => {
      const parentId = (ctx.params as any)[parentParam];
      const { entityId, } = ctx.params as any;
      const userId = (ctx as any).userId as string | null;
      const userRole = (ctx as any).userRole as string | null;

      const ownershipOk = await checkOwnership(opts.database, entityConfig as never, parentId, userId, userRole,);
      if (!ownershipOk) { return notFound("Memory not found",); }

      const row = await (opts.database as any)
        .selectFrom("actor_memories",)
        .select("id",)
        .where("id", "=", entityId,)
        .where("actor_id", "=", parentId,)
        .executeTakeFirst();
      if (!row) { return notFound("Memory not found",); }

      const searchParams = new URL((ctx as any).request.url,).searchParams;
      const maxTokens = parseIntOr(searchParams.get("maxTokens",) ?? "", 1024,);
      const expanded = await expandMemoryContext(opts.database, entityId, { maxTokens, },);
      if (!expanded) { return notFound("Memory not found",); }
      return jsonResponse(expanded,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Expand Memory source chain",
        description: "Reconstruct the source message chain bound to a Memory (try-hard remember).",
        tags: ["Memory",],
      },
    },);

  return expandRoute.use(createEntityRoutes(entityConfig as never, opts,),);
}
