// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat archive / unarchive operations.
 *
 * Archive is a soft state — `chats.is_pinned` flips to `PinnedState.Archived`
 * and the chat disappears from default listings. `is_pinned` doubles as the
 * archive flag (PinnedState.Archived) since `batchArchiveChats` already
 * standardises on that column. Hard delete lives in `delete.ts` /
 * `crud/delete.ts`; this module only flips the soft state.
 *
 * Authorization model: only the chat creator or a `role_in_chat = "owner"`
 * participant may archive/unarchive. Admins (`can(userRole, "admin.chat")`)
 * bypass the participant lookup. `checkChatSettingsAccess` already encodes
 * this rule, so we delegate.
 */
import type { Kysely, } from "kysely";
import { PinnedState, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { emitPluginEvent, } from "../../../plugins/event-bus";
import { registry, } from "../../../plugins/registry";
import { checkChatSettingsAccess, } from "../access";
import type { ServiceError, } from "../types";

/** */
export type ArchiveChatResult = { ok: true; chatId: string } | ServiceError;

/**
 * Soft-archive a chat.
 *
 * Idempotent: archiving an already-archived chat returns `{ ok: true, chatId }`
 * without an extra UPDATE so the route layer doesn't need to disambiguate.
 * The caller (`routes/chats/manage.ts`) is responsible for the
 * settings-access check; this service does not re-check authorization so a
 * route layer can compose with its own guard.
 * @param database
 * @param chatId
 * @param requesterId Authenticated user id
 * @param userRole Optional role for admin bypass (`can("admin.chat")`)
 */
export async function archiveChat(
  database: Kysely<DB>,
  chatId: string,
  requesterId: string,
  userRole: string | null | undefined,
): Promise<ArchiveChatResult> {
  const access = await checkChatSettingsAccess(database, chatId, requesterId, userRole,);
  if (!access.ok) { return access.error; }

  // Only flip when the row is not already archived — keeps the trigger
  // minimal and avoids a redundant write.
  await database
    .updateTable("chats",)
    .set({ is_pinned: PinnedState.Archived, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .where("is_pinned", "!=", PinnedState.Archived,)
    .execute();

  // FEAT-048: notify plugins of soft-archive.
  await emitPluginEvent(registry.getAllEventHandlers(), "chat.archived", { chatId, requesterId, },);

  return { ok: true, chatId, };
}

/**
 * Restore an archived chat to its previous state (unpinned).
 *
 * Archive is the only reversible flag we set on the soft path, so we restore
 * to `unpinned`. A chat that was never pinned pre-archive (rare — the pin
 * flag was unused for archived chats) ends up `unpinned`, matching the
 * column default.
 * @param database
 * @param chatId
 * @param requesterId Authenticated user id
 * @param userRole Optional role for admin bypass
 */
export async function unarchiveChat(
  database: Kysely<DB>,
  chatId: string,
  requesterId: string,
  userRole: string | null | undefined,
): Promise<ArchiveChatResult> {
  const access = await checkChatSettingsAccess(database, chatId, requesterId, userRole,);
  if (!access.ok) { return access.error; }

  await database
    .updateTable("chats",)
    .set({ is_pinned: PinnedState.Unpinned, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .where("is_pinned", "=", PinnedState.Archived,)
    .execute();

  // FEAT-048: notify plugins of unarchive.
  await emitPluginEvent(registry.getAllEventHandlers(), "chat.unarchived", { chatId, requesterId, },);

  return { ok: true, chatId, };
}

/**
 * Whether a chat is currently in the archived state.
 *
 * Pure read — used by RAG recall (`src/rag/search/quarantine.ts`) and the
 * archived-view filter in `routes/chats/list.ts`. Returns `false` for
 * missing rows so callers can use it inside `IN` filters without a NULL
 * branch.
 * @param database
 * @param chatId
 */
export async function isChatArchived(
  database: Kysely<DB>,
  chatId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("chats",)
    .select("is_pinned",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return row?.is_pinned === PinnedState.Archived;
}
