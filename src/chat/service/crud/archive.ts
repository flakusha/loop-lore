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
import { NotificationType, } from "../../../db/enums-core";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { NotificationService, } from "../../../notifications/service/service";
import { emitPluginEvent, } from "../../../plugins/event-bus";
import { registry, } from "../../../plugins/registry";
import { checkChatSettingsAccess, } from "../access";
import type { ServiceError, } from "../types";

/** Lifecycle notification kinds emitted from this module. The repo has
 * no dedicated chat-lifecycle enum (migrations are out of scope), so the
 * payload rides on `NotificationType.System` with a `data.kind` tag. */
type LifecycleKind = "chat_archived" | "chat_restored" | "chat_purged";

/**
 * Fan a chat-lifecycle event out to every chat participant except the
 * actor. NotificationService.create() already honours the user's
 * `notifications.chat.lifecycle` opt-out (silently skips when System is
 * disabled), so this helper only filters the actor.
 * @param database
 * @param chatId
 * @param actorId
 * @param kind
 */
async function notifyLifecycle(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  kind: LifecycleKind,
): Promise<void> {
  try {
    const rows = await database
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", chatId,)
      .execute();
    const svc = new NotificationService(database,);
    const titleMap: Record<LifecycleKind, string> = {
      chat_archived: "Chat archived",
      chat_restored: "Chat restored",
      chat_purged: "Chat permanently deleted",
    };
    for (const row of rows) {
      if (row.actor_id === actorId) { continue; }
      await svc.create({
        userId: row.actor_id,
        type: NotificationType.System,
        title: titleMap[kind],
        link: `/chat/${chatId}`,
        data: { kind, chatId, actorId, },
      },);
    }
  } catch (error: unknown) {
    // Notifications are observational — a failure here must not roll back
    // the archive / unarchive / purge call.
    getLogger()
      .child({ module: "chat-archive", },)
      .warn("lifecycle notification fan-out failed", {
        chatId,
        kind,
        error: error instanceof Error ? error.message : String(error,),
      },);
  }
}

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
  const archiveTimestamp = new Date().toISOString();
  await database
    .updateTable("chats",)
    .set({ is_pinned: PinnedState.Archived, updated_at: archiveTimestamp, },)
    .where("id", "=", chatId,)
    .where("is_pinned", "!=", PinnedState.Archived,)
    .execute();

  // FEAT-chat-archive-asset-cascade: soft-link linked asset_links rows so
  // views can hide archived assets without losing the row. Hard purge still
  // removes them via deleteChat's cascade.
  await database
    .updateTable("asset_links",)
    .set({ archived_at: archiveTimestamp, },)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .where("archived_at", "is", null,)
    .execute();

  // FEAT-048: notify plugins of soft-archive.
  await emitPluginEvent(registry.getAllEventHandlers(), "chat.archived", { chatId, requesterId, },);

  // FEAT-chat-archive-purge-notifications: fan out to chat participants.
  await notifyLifecycle(database, chatId, requesterId, "chat_archived",);

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

  // FEAT-chat-archive-asset-cascade: clear the soft-link stamp so linked
  // assets become visible again.
  await database
    .updateTable("asset_links",)
    .set({ archived_at: null, },)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .execute();

  // FEAT-048: notify plugins of unarchive.
  await emitPluginEvent(registry.getAllEventHandlers(), "chat.unarchived", { chatId, requesterId, },);

  // FEAT-chat-archive-purge-notifications: fan out to chat participants.
  await notifyLifecycle(database, chatId, requesterId, "chat_restored",);

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
