// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor.
 */

import { Elysia, t, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { expandMemoryContext, } from "../memory/history-search";
import { can, } from "../users/permissions";
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

  /**
   * Carry a memory into a chat: create a chat-scoped copy so prompt assembly
   * injects it for this chat without affecting other chats (per-chat inclusion).
   */
  const carryRoute = new Elysia({ name: "memories-carry", },)
    .post(
      `${withIdPath}/carry`,
      async (ctx,) => {
        const parentId = (ctx.params as any)[parentParam];
        const { entityId, } = ctx.params as any;
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ctx.body as { chatId: string };

        const ownershipOk = await checkOwnership(opts.database, entityConfig as never, parentId, userId, userRole,);
        if (!ownershipOk) { return notFound("Memory not found",); }

        const source = await (opts.database as any)
          .selectFrom("actor_memories",)
          .selectAll()
          .where("id", "=", entityId,)
          .where("actor_id", "=", parentId,)
          .executeTakeFirst();
        if (!source) { return notFound("Memory not found",); }

        await (opts.database as any)
          .insertInto("actor_memories",)
          .values({
            id: crypto.randomUUID(),
            actor_id: source.actor_id,
            source_chat_id: body.chatId,
            memory_type: source.memory_type,
            content: source.content,
            confidence: source.confidence,
            importance: source.importance,
            keywords: source.keywords,
            scope: source.scope,
            pinned: source.pinned,
            last_accessed_at: source.last_accessed_at,
            created_at: source.created_at,
            updated_at: new Date().toISOString(),
          },)
          .execute();
        return jsonResponse({ ok: true, },);
      },
      {
        body: t.Object({ chatId: t.String({ minLength: 1, },), },),
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Carry Memory into chat",
          description: "Create a chat-scoped copy of a Memory.",
          tags: ["Memory",],
        },
      },
    )
    .post(
      `${basePath}/carry-except`,
      async (ctx,) => {
        const parentId = (ctx.params as any)[parentParam];
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const body = ctx.body as { chatId: string; excludeId: string };

        const ownershipOk = await checkOwnership(opts.database, entityConfig as never, parentId, userId, userRole,);
        if (!ownershipOk) { return notFound("Actor not found",); }

        // Chat-scoped copies already carried for this chat (by content —
        // originals keep source_chat_id null, so identity goes via content).
        const existingCopies = await (opts.database as any)
          .selectFrom("actor_memories",)
          .select("content",)
          .where("actor_id", "=", parentId,)
          .where("source_chat_id", "=", body.chatId,)
          .execute();
        const carriedContents = new Set(existingCopies.map((c: { content: string },) => c.content),);

        const sources = await (opts.database as any)
          .selectFrom("actor_memories",)
          .selectAll()
          .where("actor_id", "=", parentId,)
          .where("id", "!=", body.excludeId,)
          .where("source_chat_id", "is", null,)
          .limit(200,)
          .execute();
        const toCarry = sources.filter((s: { content: string },) => !carriedContents.has(s.content,));
        for (const source of toCarry) {
          await (opts.database as any)
            .insertInto("actor_memories",)
            .values({
              id: crypto.randomUUID(),
              actor_id: source.actor_id,
              source_chat_id: body.chatId,
              memory_type: source.memory_type,
              content: source.content,
              confidence: source.confidence,
              importance: source.importance,
              keywords: source.keywords,
              scope: source.scope,
              pinned: source.pinned,
              last_accessed_at: source.last_accessed_at,
              created_at: source.created_at,
              updated_at: new Date().toISOString(),
            },)
            .execute();
        }
        return jsonResponse({ ok: true, carried: toCarry.length, },);
      },
      {
        body: t.Object({ chatId: t.String({ minLength: 1, },), excludeId: t.String({ minLength: 1, },), },),
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Carry all Memories except one",
          description: "Convert a full-carry chat to selective by copying every memory except the excluded one.",
          tags: ["Memory",],
        },
      },
    );

  return expandRoute.use(carryRoute,).use(createEntityRoutes(entityConfig as never, opts, prefix,),);
}
