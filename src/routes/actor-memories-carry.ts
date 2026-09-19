// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor memory carry routes (FEAT: per-chat memory inclusion).
 *
 * Carry a memory into a chat: create a chat-scoped copy so prompt assembly
 * injects it for this chat without affecting other chats (per-chat inclusion).
 */
import { Elysia, t, } from "elysia";
import type { Selectable, } from "kysely";
import type { Db, } from "../db";
import type { ActorMemories, } from "../db/schema-story";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { checkOwnership, } from "./entity-routes/context";
import type { EntityConfig, } from "./entity-routes/types";
import { jsonResponse, } from "./http-utils";

/** A stored actor-memory row (SELECT shape). */
type MemoryRow = Selectable<ActorMemories>;

/** Path/config bundle produced by `entityPaths` for the memories entity. */
export interface MemoryCarryPaths {
  entityConfig: EntityConfig;
  withIdPath: string;
  basePath: string;
}

/**
 * @param opts
 * @param opts.database
 * @param paths
 * @param paths.entityConfig
 * @param paths.withIdPath
 * @param paths.basePath
 * @param paths.parentParam
 * @returns Elysia plugin serving the memory carry endpoints.
 */
export function memoryCarryPlugin(
  opts: { database: Db },
  paths: MemoryCarryPaths,
): Elysia {
  const { entityConfig, withIdPath, basePath, } = paths;
  const ownership = (actorId: string, userId: string | null, userRole: string | null,) =>
    checkOwnership(opts.database, entityConfig, actorId, userId, userRole,);

  const insertCopy = (source: MemoryRow, chatId: string,) =>
    opts.database
      .insertInto("actor_memories",)
      .values({
        id: crypto.randomUUID(),
        actor_id: source.actor_id,
        source_chat_id: chatId,
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

  return new Elysia({ name: "memories-carry", },)
    .post(
      `${withIdPath}/carry`,
      async (ctx,) => {
        const params = ctx.params as { entityId: string; [key: string]: string };
        const parentId = params.actorId ?? "";
        const userId = (ctx as unknown as { userId: string | null }).userId;
        const userRole = (ctx as unknown as { userRole: string | null }).userRole;
        const body = ctx.body as { chatId: string };

        if (!(await ownership(parentId, userId, userRole,))) { return notFound("Memory not found",); }

        const source = await opts.database
          .selectFrom("actor_memories",)
          .selectAll()
          .where("id", "=", params.entityId,)
          .where("actor_id", "=", parentId,)
          .executeTakeFirst() as MemoryRow | undefined;
        if (!source) { return notFound("Memory not found",); }

        await insertCopy(source, body.chatId,);
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
        const params = ctx.params as { entityId: string; [key: string]: string };
        const parentId = params.actorId ?? "";
        const userId = (ctx as unknown as { userId: string | null }).userId;
        const userRole = (ctx as unknown as { userRole: string | null }).userRole;
        const body = ctx.body as { chatId: string; excludeId: string };

        if (!(await ownership(parentId, userId, userRole,))) { return notFound("Actor not found",); }

        // Chat-scoped copies already carried for this chat (by content —
        // originals keep source_chat_id null, so identity goes via content).
        const existingCopies = await opts.database
          .selectFrom("actor_memories",)
          .select("content",)
          .where("actor_id", "=", parentId,)
          .where("source_chat_id", "=", body.chatId,)
          .execute();
        const carriedContents = new Set(existingCopies.map((c,) => c.content),);

        const sources = await opts.database
          .selectFrom("actor_memories",)
          .selectAll()
          .where("actor_id", "=", parentId,)
          .where("id", "!=", body.excludeId,)
          .where("source_chat_id", "is", null,)
          .limit(200,)
          .execute() as MemoryRow[];
        const toCarry = sources.filter((s,) => !carriedContents.has(s.content,));
        for (const source of toCarry) {
          await insertCopy(source, body.chatId,);
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
}
