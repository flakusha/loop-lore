// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { type Kysely, sql, } from "kysely";
import { ARCHIVE_RETENTION_DAYS_DEFAULT, getConfigValue, } from "../../admin/config";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { can, } from "../../users/permissions";
import { notFound, } from "../../validation/middleware";
import { ChatIdParams, ErrorResponse, MessageIdParams, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Resolve the archive purge retention window from its admin-config value.
 * Falls back to `ARCHIVE_RETENTION_DAYS_DEFAULT` when unset, non-numeric, or
 * < 1 — a non-positive window would purge every archived message.
 * @param raw - Raw `archive_retention_days` system_config value, if seeded.
 * @returns Retention window in days.
 */
function resolveArchiveRetentionDays(raw: string | undefined,): number {
  const parsed = Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 1 ? parsed : ARCHIVE_RETENTION_DAYS_DEFAULT;
}

/** A foreign key column that points at messages.id. */
interface MessageForeignKey {
  table: string;
  column: string;
}

/**
 * Quote a SQLite identifier for interpolation into a statement.
 * @param name
 * @returns {string}
 */
function quoteIdentifier(name: string,): string {
  return `"${name.replace(/"/g, '""',)}"`;
}

/**
 * Every foreign key column that targets messages.id and whose delete action
 * blocks the delete. CASCADE removes the referencing rows and SET NULL clears
 * the reference, so neither of those stops a purge.
 * @param database The database handle to read the foreign keys with.
 * @param table The table to survey.
 * @returns The blocking foreign key columns.
 */
async function blockingMessageForeignKeysOf(database: Kysely<DB>, table: string,): Promise<MessageForeignKey[]> {
  let fks: { table: string; from: string; to: string; on_delete: string }[];
  try {
    fks = (await sql<{ table: string; from: string; to: string; on_delete: string }[]>`
      pragma foreign_key_list(${sql.raw(quoteIdentifier(table,),)})
    `.execute(database,)).rows;
  } catch (error) {
    // A table whose foreign key list cannot be read is a virtual table: it
    // cannot hold a foreign key, so it cannot block a purge either.
    getLogger().warn("fk survey skipped a table", {
      table,
      message: error instanceof Error ? error.message : String(error,),
    },);

    return [];
  }

  const blocking: MessageForeignKey[] = [];
  for (const fk of fks) {
    if (fk.table !== "messages" || fk.to !== "id") { continue; }
    const action = fk.on_delete.toUpperCase();
    if (action === "CASCADE" || action === "SET NULL") { continue; }
    // The pragma names the referenced table (fk.table) and the referenced
    // column (fk.to); the referencing column is fk.from and the referencing
    // table is the surveyed one.
    blocking.push({ table: table, column: fk.from, },);
  }

  return blocking;
}

/**
 * Every foreign key column of the database that targets messages.id and
 * whose delete action blocks the delete.
 * @param database The database handle to read the foreign keys with.
 * @returns The blocking foreign key columns.
 */
async function blockingMessageForeignKeys(database: Kysely<DB>,): Promise<MessageForeignKey[]> {
  const tables = (await sql<{ name: string }[]>`
    select name from sqlite_master where type = 'table' and name not like 'sqlite_%'
  `.execute(database,)).rows;

  const blocking: MessageForeignKey[] = [];
  for (const { name, } of tables) {
    blocking.push(...await blockingMessageForeignKeysOf(database, name,),);
  }

  return blocking;
}

/**
 * The candidate messages that a surviving row still references. Such a message
 * is structural: the purge keeps it (archived) instead of deleting it and
 * aborting the whole run.
 *
 * The survey is PRAGMA-driven, so it covers every FK column that targets
 * messages.id. The hand-written survey it replaces only knew
 * messages.parent_id and chat_branches.parent_message_id, so a message
 * referenced from generation_attempts, whitenotes, game_states,
 * story_triggers or conversation_merge aborted the purge with a raw SQLite
 * 500.
 * @param database The database handle to read the references with.
 * @param candidateIds The messages the purge would delete.
 * @returns The blocked message ids.
 */
async function structuralReferences(database: Kysely<DB>, candidateIds: string[],): Promise<Set<string>> {
  const blocked = new Set<string>();

  for (const fk of await blockingMessageForeignKeys(database,)) {
    const column = quoteIdentifier(fk.column,);
    const table = quoteIdentifier(fk.table,);
    // A referencing row survives the purge unless it is a message the purge
    // deletes itself (messages.parent_id - the leaf-first delete handles
    // those).
    const rows = fk.table === "messages"
      ? (await sql<{ value: string | null }[]>`
        select ${sql.raw(column,)} as value from ${sql.raw(table,)}
        where ${sql.raw(column,)} in (${sql.join(candidateIds,)}) and "id" not in (${sql.join(candidateIds,)})
      `.execute(database,)).rows
      : (await sql<{ value: string | null }[]>`
        select ${sql.raw(column,)} as value from ${sql.raw(table,)}
        where ${sql.raw(column,)} in (${sql.join(candidateIds,)})
      `.execute(database,)).rows;

    for (const row of rows) {
      if (row.value !== null) { blocked.add(row.value,); }
    }
  }

  return blocked;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { messages: { ":id": { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function archivingRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "messages-archiving", },)
    .post(
      `${prefix}/messages/:id/archive`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();

        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }

        await database
          .updateTable("messages",)
          .set({ archived_at: new Date().toISOString(), visibility: "auto_hidden", },)
          .where("id", "=", id,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/messages/:id/restore`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();

        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }

        await database
          .updateTable("messages",)
          .set({ archived_at: null, visibility: "visible", },)
          .where("id", "=", id,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/chats/:id/messages/purge`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id: chatId, } = ctx.params as { id: string };

        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", chatId,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.chatNotFound",) ?? "Chat not found",);
        }

        const retentionDays = resolveArchiveRetentionDays(await getConfigValue(database, "archive_retention_days",),);
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000,).toISOString();

        // FK-safe purge (BUG-chat-minors-variant): messages.parent_id and
        // chat_branches.parent_message_id both reference messages.id with no
        // cascade, so a bulk delete that takes a still-referenced row aborts
        // with an FK error (500). Refuse structural rows instead — keep them
        // archived — delete the rest leaf-first, and clean their asset_links
        // rows in the SAME transaction so no dangling links survive.
        const candidates = await database
          .selectFrom("messages",)
          .select(["id", "parent_id",],)
          .where("chat_id", "=", chatId,)
          .where("archived_at", "is not", null,)
          .where("archived_at", "<", cutoff,)
          .execute();

        if (candidates.length === 0) { return jsonResponse({ ok: true, purged: 0, },); }

        const purgeable = new Set(candidates.map((row,) => row.id),);
        const parentOf = new Map(candidates.map((row,) => [row.id, row.parent_id,] as const),);

        // Rows referenced from OUTSIDE the purge set are structural:
        // surviving children (parent_id), branch fork-points, and every
        // other row that still points at the message.
        // The survey runs before the transaction opens: the raw PRAGMA and
        // sqlite_master queries cannot run on a Kysely transaction.
        const blocked = await structuralReferences(database, [...purgeable,],);

        const purged = await database.transaction().execute(async (trx,) => {
          // Delete leaf-first so a parent never outlives a child inside the
          // purge set (immediate FK enforcement). childCount tracks remaining
          // in-set children per parent so each pass is O(n), not O(n²).
          const childCount = new Map<string, number>();
          for (const parentId of parentOf.values()) {
            if (parentId) { childCount.set(parentId, (childCount.get(parentId,) ?? 0) + 1,); }
          }

          let deleted = 0;
          const remaining = new Set(purgeable,);
          while (remaining.size > 0) {
            const deletable: string[] = [];
            for (const id of remaining) {
              if (blocked.has(id,)) { continue; }
              if ((childCount.get(id,) ?? 0) === 0) { deletable.push(id,); }
            }

            if (deletable.length === 0) { break; }

            await trx.deleteFrom("messages",).where("id", "in", deletable,).execute();
            await trx
              .deleteFrom("asset_links",)
              .where("entity_type", "=", "message",)
              .where("entity_id", "in", deletable,)
              .execute();

            deleted += deletable.length;
            for (const id of deletable) {
              remaining.delete(id,);
              const parentId = parentOf.get(id,);
              if (parentId) { childCount.set(parentId, childCount.get(parentId,)! - 1,); }
            }
          }

          if (remaining.size > 0) {
            getLogger().child({ module: "messages.archiving", },).warn(
              "purge skipped structurally-referenced archived messages",
              { chatId, skipped: remaining.size, },
            );
          }

          return deleted;
        },);

        return jsonResponse({ ok: true, purged, },);
      },
      { params: ChatIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    );
}
