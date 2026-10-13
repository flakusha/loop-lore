// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes — shadow notes CRUD.
 */
import { Elysia, } from "elysia";
import { checkChatSettingsAccess, } from "../../chat/service";
import { registerContentVersion, } from "../../db/content-version";
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
import { injectShadowRevealNarration, } from "./narration";
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
            // Free-form trigger expression — stored verbatim except that
            // control characters (C0 + DEL) are stripped: they carry no
            // meaning, break the one-line prompt rendering, and are a
            // log-injection vector.
            //
            // `\p{Cc}` is C0 + DEL + C1(0080-009F); the callback drops only
            // C0 + DEL and passes C1 back, matching the previous literal class
            // exactly. Not a `v`-flag class difference: the tsconfig targets
            // ES6, where `v` does not exist.
            trigger_condition: body.triggerCondition?.replace(/\p{Cc}/gu, (ch,) => ch >= "\u{80}" ? ch : "",) ?? null,
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
            .select(["content", "status", "visibility", "revealed_to",],)
            .where("id", "=", noteId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          if (!note) { return notFound("Shadow note not found",); }

          const body = ctx.body as typeof RevealBody.static;
          const incoming = body?.revealedTo ?? [];
          // Append + dedupe; only real arrays feed the append — hostile
          // stored values (objects, bare strings) count as no audience.
          const parsed = note.revealed_to
            ? jsonParseOr<unknown>(note.revealed_to, [],)
            : [];

          const existing = Array.isArray(parsed,) ? parsed : [];

          const unique = new Set([...existing, ...incoming,],);
          const revealedTo = Array.from(unique,);

          // `revealed:hidden` is drift per the status x visibility invariant,
          // so revealing also flips visibility; revealed notes are excluded
          // from LLM injection by `status`, so the flip only affects reading.
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

          // Narrate only on the hidden -> revealed transition — re-revealing
          // must not re-emit; gm_only reveals never narrate (dev log only).
          const wasRevealed = note.status === ShadowNoteStatus.Revealed;
          if (!wasRevealed && note.visibility === ShadowNoteVisibility.UserVisible) {
            await injectShadowRevealNarration(database, id, note.content,);
          } else if (!wasRevealed) {
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
