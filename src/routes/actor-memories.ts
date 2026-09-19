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
import { recordAuditLog, } from "../memory/audit";
import { expandMemoryContext, } from "../memory/history-search";
import { can, } from "../users/permissions";
import { parseIntOr, } from "../utils/parse-number";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { memoryCarryPlugin, } from "./actor-memories-carry";
import { createEntityRoutes, } from "./entity-routes";
import { checkOwnership, entityPaths, } from "./entity-routes/context";
import { jsonResponse, } from "./http-utils";
import { memoryAuditRoutes, } from "./memory-audit";

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 * @returns Elysia plugin for the actor memories CRUD surface.
 */
export function actorMemoriesRoutes(opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
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
      confidence: "confidence",
      memoryType: "memory_type",
      importance: "importance",
      keywords: "keywords",
      pinned: "pinned",
      sourceChatId: "source_chat_id",
      sourceMessageIds: "source_message_ids",
      sourceChatIds: "source_chat_ids",
      extractionKind: "extraction_kind",
      expiresAt: "expires_at",
      scope: "scope",
      reviewStatus: "review_status",
    },
    jsonFields: ["keywords", "sourceMessageIds", "sourceChatIds",],
    defaults: {
      memoryType: "fact",
      confidence: 1,
      importance: 1,
      pinned: "unpinned",
    },
    createRequired: ["content",],
    writeGuard: async (
      guard: { body: Record<string, unknown>; existing: Record<string, unknown> | null; userRole: string | null },
    ) => {
      const bodyScope = guard.body.scope;
      const rowScope = (guard.existing as { scope?: string } | null)?.scope;
      const userRole = guard.userRole;
      if ((bodyScope === "world" || rowScope === "world") && !can(userRole, "admin.world",)) {
        return { ok: false as const, status: 403, message: "World memories are admin-managed", };
      }
      return { ok: true as const, };
    },
    valueTransforms: {
      pinned: (value: unknown,) => (value === true || value === "pinned" ? "pinned" : "unpinned"),
    },
    responseTransforms: {
      pinned: (value: unknown,) => value === "pinned",
    },
  } as const;
  const { withIdPath, basePath, parentParam, } = entityPaths(entityConfig as never, prefix,);

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

  // FEAT-075: emit audit rows for memory CRUD performed via the generic
  // entity-routes layer. We scope this hook to /api/actors/:actorId/memories
  // paths only — no other entity mounted under actor-memories.ts — so a
  // PUT/DELETE/POST on a memory URL writes one audit row.
  const auditHook = new Elysia({ name: "memory-audit-hook", },)
    .onAfterHandle(async (ctx,) => {
      const path = ctx.path;
      const method = ctx.request.method.toUpperCase();
      if (!path.startsWith(`${prefix}/actors/`,)) { return; }
      if (!path.includes("/memories",)) { return; }
      // Skip the audit-list sub-route itself (read-only; never audited).
      if (path.endsWith("/audit",)) { return; }

      const params = ctx.params as Record<string, string | undefined>;
      const actorId = params.actorId;
      const memoryId = params.entityId;
      const userId = (ctx as unknown as { userId: string | null }).userId;
      // Skip writes that did not actually mutate state (4xx handler returned early).
      const setStatus = (ctx as unknown as { set?: { status?: number | string } }).set?.status;
      const status = typeof setStatus === "number" ? setStatus : 200;
      if (status >= 400) { return; }
      if (!actorId || !memoryId) { return; }

      let action: "pin" | "unpin" | "modify" | "delete" | null = null;
      if (method === "DELETE") { action = "delete"; }
      else if (method === "PUT") {
        const body = (ctx as unknown as { body?: Record<string, unknown> }).body ?? {};
        if (body.pinned === true || body.pinned === "pinned") { action = "pin"; }
        else if (body.pinned === false || body.pinned === "unpinned") { action = "unpin"; }
        else { action = "modify"; }
      }
      if (!action) { return; }

      await recordAuditLog(opts.database, [{
        memoryId,
        actorId,
        userId,
        action,
        details: { method, path, },
      },],);
    },);

  return auditHook
    .use(memoryAuditRoutes({ database: opts.database, }, prefix,),)
    .use(expandRoute,)
    .use(
      memoryCarryPlugin({ database: opts.database, }, {
        entityConfig: entityConfig as never,
        withIdPath,
        basePath,
      },),
    )
    .use(createEntityRoutes(entityConfig as never, opts, prefix,),);
}
