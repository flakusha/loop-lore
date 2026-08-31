// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes — shadow notes CRUD.
 */
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import { checkChatAccess, } from "../../chat/service";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
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

/**
 * Inject a narrator system message into the chat when a shadow note is revealed.
 * Reveals are rare and high-impact — the narration makes the moment memorable
 * instead of silently flipping the note's status in the background.
 *
 * Mirrors the pattern from `src/story/game-master/narration.ts`.
 * @param database
 * @param chatId
 * @param content
 */
async function injectShadowRevealNarration(
  database: HandlerOpts["database"],
  chatId: string,
  content: string,
): Promise<void> {
  const narrator = await database
    .selectFrom("actors",)
    .select("id",)
    .where("actor_type", "=", "narrator",)
    .where("agent_type", "=", "narrator",)
    .executeTakeFirst();

  if (!narrator) { return; }

  const text = `[Shadow Revealed] ${content}`;

  let storedContent = text;
  let storedKeyId: string | null = null;
  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    const enc = await encryptMessageContent({
      database,
      chatId,
      actorId: narrator.id,
      plaintext: text,
      smk,
    },);
    storedContent = enc.storedContent;
    storedKeyId = enc.keyId ?? null;
  }

  await database
    .insertInto("messages",)
    .values({
      id: randomUUID() as string,
      chat_id: chatId,
      actor_id: narrator.id,
      role: MessageRole.System,
      content: storedContent,
      key_id: storedKeyId,
      content_type: MessageContentType.Narration,
      content_format: MessageContentFormat.Markdown,
      content_encoding: ContentEncoding.Identity,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
    },)
    .execute();
}

/**
 * @param opts
 * @param prefix
 */
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

          // Fetch content before update so we can use it in narration.
          const note = await database
            .selectFrom("shadow_notes",)
            .select(["content",],)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (!note) { return notFound("Shadow note not found",); }

          const result = await database
            .updateTable("shadow_notes",)
            .set({ status: "revealed", },)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (Number(result?.numUpdatedRows ?? 0,) === 0) {
            return notFound("Shadow note not found",);
          }

          // Emit a narrator message so the reveal has real narrative impact
          // instead of silently flipping the status in the background.
          await injectShadowRevealNarration(database, id, note.content,);

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
