/**
 * GM Notes Routes
 *
 * CRUD endpoints for shadow notes and whitenotes.
 * These are GM narrative tools attached to chats.
 *
 * Shadow notes: hidden influences the GM tracks (foreshadowing, consequences, etc.)
 * Whitenotes: visible narrative directives (direction, tone, pacing, etc.)
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import {
  ChatIdParams,
  PaginationQuery,
} from "../validation/schemas";
import {
  forbiddenResponse as forbidden,
  jsonCreated,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Validation Schemas ───────────────────────────────────────

const ShadowNoteBody = t.Object({
  type: t.UnionEnum([
    "foreshadowing",
    "consequence",
    "hidden_fact",
    "player_motivation",
    "world_secret",
    "narrative_hook",
  ],),
  content: t.String({ minLength: 1, },),
},);

const WhiteneoteBody = t.Object({
  type: t.UnionEnum([
    "narrative_direction",
    "character_motivation",
    "plot_thread",
    "tone",
    "pacing",
    "theme",
  ],),
  content: t.String({ minLength: 1, },),
  priority: t.Optional(t.Numeric({ minimum: 1, maximum: 10, default: 5, },),),
  scope: t.Optional(t.UnionEnum(["scene", "chapter", "session", "world",],),),
  expiresAt: t.Optional(t.Nullable(t.String(),),),
},);

const NoteIdParams = t.Object({
  id: t.String({ format: "uuid", },),
  noteId: t.String({ format: "uuid", },),
},);

// ── Route Factory ────────────────────────────────────────────

export function gmNotesRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "gm-notes", },)
      // ── Shadow Notes ──────────────────────────────────────────

      .get(
        "/api/chats/:id/shadow-notes",
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
        "/api/chats/:id/shadow-notes",
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
              revealed: 0,
              created_at: now,
            },)
            .execute();

          return jsonCreated({ id: noteId, },);
        },
        { params: ChatIdParams, body: ShadowNoteBody, },
      )
      .post(
        "/api/chats/:id/shadow-notes/:noteId/reveal",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, noteId, } = ctx.params as { id: string; noteId: string };

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await database
            .updateTable("shadow_notes",)
            .set({ revealed: 1, },)
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
        "/api/chats/:id/shadow-notes/:noteId",
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
      // ── Whitenotes ────────────────────────────────────────────

      .get(
        "/api/chats/:id/whitenotes",
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
        "/api/chats/:id/whitenotes",
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
        "/api/chats/:id/whitenotes/:noteId",
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
