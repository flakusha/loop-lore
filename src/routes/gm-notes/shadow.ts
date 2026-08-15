/**
 * GM Notes — shadow notes CRUD.
 */
import { Elysia, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import { uid, } from "../../utils";
import {
  ChatIdParams,
  PaginationQuery,
} from "../../validation/schemas";
import {
  forbiddenResponse as forbidden,
  jsonCreated,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import { NoteIdParams, ShadowNoteBody, } from "./schemas";
import type { HandlerOpts, } from "./types";

export function shadowRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "gm-notes-shadow", },)
      .get(
        `${prefix}/chats/:id/shadow-notes`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const page = (ctx.query.page as number) ?? 1;
          const pageSize = (ctx.query.pageSize as number) ?? 50;
          const offset = (page - 1) * pageSize;

          // NOTE: selectAll() is REQUIRED — Kysely 0.29 emits an empty
          // select list (`select from ...`) when `.select()` is omitted,
          // which SQLite rejects with "near 'from': syntax error".
          // Queries also run sequentially (not Promise.all) — bun:sqlite
          // is single-connection and interleaving is safer to avoid.
          const items = await database
            .selectFrom("shadow_notes",)
            .selectAll()
            .where("chat_id", "=", id,)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,)
            .execute();
          const countResult = await database
            .selectFrom("shadow_notes",)
            .select(database.fn.countAll<number>().as("total",),)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          const total = countResult?.total ?? 0;
          return jsonResponse({ items, total, page, pageSize, },);
        },
        { params: ChatIdParams, query: PaginationQuery, },
      )
      .post(
        `${prefix}/chats/:id/shadow-notes`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as typeof ShadowNoteBody.static;
          const noteId = uid();
          const now = new Date().toISOString();

          await database
            .insertInto("shadow_notes",)
            .values({
              id: noteId,
              chat_id: id,
              type: body.type as never,
              content: body.content,
              status: "hidden",
              created_at: now,
            },)
            .execute();

          return jsonCreated({ id: noteId, },);
        },
        { params: ChatIdParams, body: ShadowNoteBody, },
      )
      .post(
        `${prefix}/chats/:id/shadow-notes/:noteId/reveal`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, noteId, } = ctx.params as { id: string; noteId: string };

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await database
            .updateTable("shadow_notes",)
            .set({ status: "revealed", },)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (Number(result?.numUpdatedRows ?? 0,) === 0) {
            return notFound("Shadow note not found",);
          }

          return jsonNoContent();
        },
        { params: NoteIdParams, },
      )
      .delete(
        `${prefix}/chats/:id/shadow-notes/:noteId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, noteId, } = ctx.params as { id: string; noteId: string };

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await database
            .deleteFrom("shadow_notes",)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (Number(result?.numDeletedRows ?? 0,) === 0) {
            return notFound("Shadow note not found",);
          }

          return jsonNoContent();
        },
        { params: NoteIdParams, },
      )
  );
}
