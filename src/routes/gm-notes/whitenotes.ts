/**
 * GM Notes — whitenotes CRUD.
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
import { NoteIdParams, WhiteneoteBody, } from "./schemas";
import type { HandlerOpts, } from "./types";

export function whitenoteRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "gm-notes-whitenotes", },)
      .get(
        prefix + "/chats/:id/whitenotes",
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

          // selectAll() required — see shadow-notes GET note above.
          const items = await database
            .selectFrom("whitenotes",)
            .selectAll()
            .where("chat_id", "=", id,)
            .orderBy("priority", "desc",)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,)
            .execute();
          const countResult = await database
            .selectFrom("whitenotes",)
            .select(database.fn.countAll<number>().as("total",),)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          const total = countResult?.total ?? 0;
          return jsonResponse({ items, total, page, pageSize, },);
        },
        { params: ChatIdParams, query: PaginationQuery, },
      )
      .post(
        prefix + "/chats/:id/whitenotes",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as typeof WhiteneoteBody.static;
          const noteId = uid();
          const now = new Date().toISOString();

          await database
            .insertInto("whitenotes",)
            .values({
              id: noteId,
              chat_id: id,
              type: body.type as never,
              content: body.content,
              priority: body.priority ?? 5,
              scope: (body.scope) ?? "scene",
              expires_at: body.expiresAt ?? null,
              created_at: now,
            },)
            .execute();

          return jsonCreated({ id: noteId, },);
        },
        { params: ChatIdParams, body: WhiteneoteBody, },
      )
      .delete(
        prefix + "/chats/:id/whitenotes/:noteId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, noteId, } = ctx.params as { id: string; noteId: string };

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await database
            .deleteFrom("whitenotes",)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (Number(result?.numDeletedRows ?? 0,) === 0) {
            return notFound("Whiteneote not found",);
          }

          return jsonNoContent();
        },
        { params: NoteIdParams, },
      )
  );
}
