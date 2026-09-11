// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat ownership transfer service.
 *
 * Transfers the ownership claim (`chats.created_by`) from one user to another
 * participant-or-not. Two modes:
 *   - Existing participant: flip `created_by` and grant `role_in_chat = "owner"`
 *     to the new owner; demote the previous owner to `member`.
 *   - Non-participant: auto-invite with `role_in_chat = "owner"` BEFORE the
 *     `created_by` flip.
 *
 * Authority: admin OR the current owner (`checkChatSettingsAccess`). We
 * additionally require `requesterId === previousOwnerId` (except admin) so a
 * delegated `role_in_chat = 'owner'` grant cannot pass the chat around.
 *
 * Audit + notification: writes a `log_entries` row with `event_type =
 * "chat_ownership_transferred"` and emits two notifications via
 * `NotificationService.emit` (fire-and-forget) — previous owner + new owner.
 *
 * No schema migration: ownership is encoded as `created_by` (existing) +
 * `role_in_chat` (existing enum value `owner`).
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, NotificationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { NotificationService, } from "../../notifications/service";
import { can, } from "../../users/permissions";
import { safeJsonStringify, } from "../../utils/safe-json";
import { checkChatSettingsAccess, } from "./access";
import type { ServiceError, } from "./types";

/** Input for an ownership-transfer request. */
export interface TransferOwnershipOptions {
  chatId: string;
  requesterId: string;
  requesterRole: string | null | undefined;
  newOwnerId: string;
  reason?: string;
}

/** Result payload on a successful transfer. */
export interface TransferOwnershipResult {
  newOwnerId: string;
  previousOwnerId: string;
  autoInvited: boolean;
}

/** Outcome envelope — success carries the result; failure carries a ServiceError. */
export type TransferOwnershipOutcome =
  | { ok: true; result: TransferOwnershipResult }
  | { ok: false; error: ServiceError };

const ownershipLogger = (): ReturnType<typeof getLogger> => getLogger().child({ module: "chat-ownership", },);

/**
 * Atomically transfer chat ownership.
 * @param db
 * @param opts
 * @returns outcome with transferred ids + auto-invite flag, or a ServiceError
 */
export async function transferOwnership(
  db: Kysely<DB>,
  opts: TransferOwnershipOptions,
): Promise<TransferOwnershipOutcome> {
  const { chatId, requesterId, requesterRole, newOwnerId, } = opts;

  if (newOwnerId === requesterId) {
    // TODO(chat-ownership): ownerless chats stay stuck — the previous-owner check below
    // returns bad_request when chats.created_by is null (unreachable given the schema
    // guard, but defense-in-depth). Decide the recovery path for that branch.
    return {
      ok: false,
      error: { code: "bad_request", message: "Cannot transfer ownership to yourself", },
    };
  }

  // Admin bypass runs BEFORE `checkChatSettingsAccess`; that helper only consults
  // creator + role_in_chat and would otherwise 403 an admin who isn't a participant.
  const isAdmin = can(requesterRole, "admin.chat",);
  if (!isAdmin) {
    const settings = await checkChatSettingsAccess(db, chatId, requesterId, requesterRole,);
    if (!settings.ok) {
      return settings;
    }
  }

  // Load chat, then look up the new owner's participant row. Sequential so
  // a missing chat surfaces before we probe participants.
  const chat = await db
    .selectFrom("chats",)
    .select(["id", "created_by", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  const newOwnerParticipant = await db
    .selectFrom("chat_participants",)
    .select(["actor_id", "role_in_chat",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", newOwnerId,)
    .executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  const previousOwnerId = chat.created_by;
  if (!previousOwnerId) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Chat has no current owner", },
    };
  }

  // TODO(chat-ownership): validate newOwnerId (FKs users/actors) up front — bogus ids die deep in the tx as a flattened 400.
  if (previousOwnerId === newOwnerId) {
    return {
      ok: false,
      error: { code: "bad_request", message: "New owner is already the current owner", },
    };
  }

  // Authority re-check: this guard rejects a delegated `role_in_chat = 'owner'`
  // grant from passing the chat around — only the actual current owner OR an admin
  // may transfer. (Admins already bypassed the initial access check above.)
  // TOCTOU guard lives inside the tx below: the `created_by` flip is
  // conditional on nobody else having moved ownership since the pre-tx read.
  if (!isAdmin && requesterId !== previousOwnerId) {
    return {
      ok: false,
      error: { code: "forbidden", message: "Only the current owner or an admin may transfer ownership", },
    };
  }

  const autoInvited = !newOwnerParticipant;
  const now = new Date().toISOString();
  const reason = opts.reason?.trim().slice(0, 500,) ?? null;

  const auditMeta = (() => {
    const result = safeJsonStringify({
      entity_type: "chat",
      entity_id: chatId,
      action: "transfer_ownership",
      previous_owner_id: previousOwnerId,
      new_owner_id: newOwnerId,
      auto_invited: autoInvited,
      reason,
    },);
    return result.ok ? result.value : "{}";
  })();
  const CONCURRENT_MODIFICATION = "chat-ownership-concurrent-modification";
  try {
    const outcome = await db.transaction().execute(async (trx,) => {
      // Linearization point: the flip applies only if ownership hasn't
      // moved since the pre-tx read. Zero rows ⇒ a concurrent transfer
      // won; throw before writing anything so the loser leaves no
      // partial state and exactly one winner emerges.
      const flipped = await trx
        .updateTable("chats",)
        .set({ created_by: newOwnerId, updated_at: now, },)
        .where("id", "=", chatId,)
        .where("created_by", "=", previousOwnerId,)
        .executeTakeFirst();
      if (Number(flipped.numUpdatedRows ?? 0,) === 0) {
        throw new Error(CONCURRENT_MODIFICATION,);
      }

      if (autoInvited) {
        await trx
          .insertInto("chat_participants",)
          .values({
            chat_id: chatId,
            actor_id: newOwnerId,
            role_in_chat: ChatParticipantRole.Owner,
            joined_at: now,
            initiative: 0,
            talkativity: 50,
          },)
          .execute();
      } else {
        await trx
          .updateTable("chat_participants",)
          .set({ role_in_chat: ChatParticipantRole.Owner, },)
          .where("chat_id", "=", chatId,)
          .where("actor_id", "=", newOwnerId,)
          .execute();
      }

      await trx
        .updateTable("chat_participants",)
        .set({ role_in_chat: ChatParticipantRole.Member, },)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", previousOwnerId,)
        .execute();

      await trx
        .insertInto("log_entries",)
        .values({
          id: crypto.randomUUID(),
          level: 30,
          timestamp: Date.now(),
          time: now,
          message: "Chat ownership transferred",
          module: "chat-ownership",
          user_id: requesterId,
          meta: auditMeta,
          event_type: "chat_ownership_transferred",
          entity_type: "chat",
          entity_id: chatId,
          created_at: now,
        },)
        .execute();

      return { newOwnerId, previousOwnerId, autoInvited, };
    },);

    // `NotificationService.emit` is fire-and-forget: it swallows errors
    // internally and logs via its own logger. Do not wrap it here.
    const notifier = new NotificationService(db,);
    notifier.emit({
      userId: outcome.previousOwnerId,
      type: NotificationType.System,
      title: "Ownership transferred",
      body: "You are no longer the owner of this chat",
      link: `/chat/${chatId}`,
      data: { chatId, newOwnerId: outcome.newOwnerId, autoInvited: outcome.autoInvited, reason, },
    },);
    notifier.emit({
      userId: outcome.newOwnerId,
      type: NotificationType.System,
      title: "You are now the chat owner",
      body: outcome.autoInvited
        ? "You have been added as the owner of this chat"
        : "You have been promoted to chat owner",
      link: `/chat/${chatId}`,
      data: { chatId, previousOwnerId: outcome.previousOwnerId, reason, },
    },);
    ownershipLogger().info("ownership transferred", {
      chatId,
      previousOwnerId: outcome.previousOwnerId,
      newOwnerId: outcome.newOwnerId,
      autoInvited: outcome.autoInvited,
    },);

    return { ok: true, result: outcome, };
  } catch (err) {
    if (err instanceof Error && err.message === CONCURRENT_MODIFICATION) {
      return {
        ok: false,
        error: { code: "bad_request", message: "Chat ownership changed concurrently; refresh and retry", },
      };
    }
    ownershipLogger().error(
      "ownership transfer failed",
      err instanceof Error ? err : new Error(String(err,),),
      { chatId, },
    );
    return {
      ok: false,
      error: { code: "bad_request", message: "Transfer failed; transaction rolled back", },
    };
  }
}
