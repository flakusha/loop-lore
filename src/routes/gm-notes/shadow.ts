// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes — shadow notes CRUD.
 */
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import { checkChatSettingsAccess, } from "../../chat/service";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import { registerContentVersion, } from "../../db/content-version";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import { getChildLogger, } from "../../logger";
import { jsonParseOr, safeJsonStringify, uid, } from "../../utils";
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
import { NoteIdParams, RevealBody, ShadowNoteBody, } from "./schemas";
import type { HandlerOpts, } from "./types";

import { ShadowNoteStatus, ShadowNoteVisibility, } from "../../db/enums-gm";
import { assertValidWrite, } from "../../db/validators/enforce";

// Base `data_version` 0 projection for `shadow_notes` (columns added by
// migration 034). GM-authored content, so integrity tracking matters.
registerContentVersion("shadow_notes", 0, [
  "chat_id",
  "type",
  "content",
  "status",
  "visibility",
  "author_type",
],);

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
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "shadow-notes": { ...; }; }; }; }; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
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

          const access = await checkChatSettingsAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const page = (ctx.query.page as number) ?? 1;
          const pageSize = (ctx.query.pageSize as number) ?? 50;
          const offset = (page - 1) * pageSize;

          // NOTE: selectAll() is REQUIRED — Kysely 0.29 emits an empty
          // select list (`select from ...`) when `.select()` is omitted,
          // which SQLite rejects with "near 'from': syntax error".
          // Queries also run sequentially (not Promise.all) — bun:sqlite
          // is single-connection and interleaving is safer to avoid.
          const rows = await database
            .selectFrom("shadow_notes",)
            .selectAll()
            .where("chat_id", "=", id,)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,)
            .execute();

          // `revealed_to` is a JSON-array text column — decode for callers.
          const items = Array.from(rows, (row,) => ({
            ...row,
            revealed_to: row.revealed_to
              ? jsonParseOr<string[]>(row.revealed_to, [],)
              : null,
          }),);

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

          const access = await checkChatSettingsAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as typeof ShadowNoteBody.static;
          const noteId = uid();
          const now = new Date().toISOString();

          const noteRow = {
            id: noteId,
            chat_id: id,
            type: body.type as never,
            content: body.content,
            status: ShadowNoteStatus.Hidden,
            visibility: ShadowNoteVisibility.UserVisible,
            created_at: now,
            // author_type is optional in the body; the DB column defaults
            // to "user" for legacy callers. We forward the explicit value
            // when present so GM-panel callers can tag gm/system notes.
            author_type: (body.authorType ?? "user") as never,
            expires_at: body.expiresAt ?? null,
            // Free-form trigger expression — stored verbatim.
            trigger_condition: body.triggerCondition ?? null,
          };

          assertValidWrite("shadow_notes", noteRow,);
          await database.insertInto("shadow_notes",).values(noteRow,).execute();

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

          const access = await checkChatSettingsAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          // Fetch content + reveal bookkeeping before update so narration and
          // the `revealed_to` append can use them.
          const note = await database
            .selectFrom("shadow_notes",)
            .select(["content", "visibility", "revealed_to",],)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (!note) { return notFound("Shadow note not found",); }

          const body = ctx.body as typeof RevealBody.static;
          const incoming = body?.revealedTo ?? [];
          // Append + dedupe: an already-revealed note may be surfaced to
          // more players; existing ids are never dropped.
          const existing = note.revealed_to
            ? jsonParseOr<string[]>(note.revealed_to, [],)
            : [];

          const unique = new Set([...existing, ...incoming,],);
          const revealedTo = Array.from(unique,);

          // A revealed note must sit on the user-visible surface per the
          // `shadowNotesStatusVisibility` invariant (`revealed:hidden` is
          // leak/drift) — so revealing a gm_only note also flips its
          // visibility. Revealed notes are excluded from LLM injection by
          // `status`, so the flip only affects the reading surface.
          const nextVisibility = note.visibility === ShadowNoteVisibility.UserVisible
            ? note.visibility
            : ShadowNoteVisibility.UserVisible;

          assertValidWrite("shadow_notes", { status: ShadowNoteStatus.Revealed, visibility: nextVisibility, },);

          const serialized = safeJsonStringify(revealedTo,);
          const result = await database
            .updateTable("shadow_notes",)
            .set({
              status: ShadowNoteStatus.Revealed,
              visibility: nextVisibility,
              // String[] always serializes; fall back to the prior value so a
              // (theoretical) failure never drops recorded ids.
              revealed_to: serialized.ok ? serialized.value : note.revealed_to,
            },)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (Number(result?.numUpdatedRows ?? 0,) === 0) {
            return notFound("Shadow note not found",);
          }

          // Emit a narrator message so a player-visible reveal has real
          // narrative impact instead of silently flipping the status. A
          // gm_only (`hidden`) reveal must NEVER reach the player surface —
          // the row still updates, but the narration is suppressed and the
          // reveal is surfaced in the dev log instead.
          if (note.visibility === ShadowNoteVisibility.UserVisible) {
            await injectShadowRevealNarration(database, id, note.content,);
          } else {
            getChildLogger("gm-notes",)?.info(
              "gm.note.reveal: gm_only note revealed — narration suppressed",
              { chatId: id, noteId, visibility: note.visibility, },
            );
          }

          return jsonNoContent();
        },
        { params: NoteIdParams, body: RevealBody, },
      )
      .delete(
        `${prefix}/chats/:id/shadow-notes/:noteId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, noteId, } = ctx.params as { id: string; noteId: string };

          const access = await checkChatSettingsAccess(database, id, userId, userRole,);
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
