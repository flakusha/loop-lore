// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owners-set operations: add/remove a chat owner
 * (epic-chat-multi-ownership, TASK-chat-owners-service). Authority is any
 * current owner or an admin (`can(role, "admin.chat")`); errors and the
 * CONCURRENT_MODIFICATION channel mirror ./ownership.ts.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import {
  demoteOwnerParticipantRole,
  listOwnerUserIds,
  materializeCreatorOwnerRow,
  resolveActorOwningUser,
  writeOwnersAuditRow,
} from "./owners-core";
import { emitOwnersChangeNotifications, } from "./owners-events";
import type { OwnersChangeEvent, } from "./owners-events";
import {
  type AddChatOwnerOptions,
  type ChatOwnersOpOutcome,
  MAX_CHAT_OWNERS,
  type RemoveChatOwnerOptions,
} from "./owners-types";
import { CONCURRENT_MODIFICATION, ownershipLogger, } from "./ownership-errors";
import type { ServiceError, } from "./types";

/**
 * Owner-or-admin authority check shared by both operations.
 * @param {Kysely<DB>} db
 * @param {string} chatId
 * @param {string} requesterId
 * @param {string | null | undefined} requesterRole
 * @returns {Promise<ChatOwnersOpOutcome | null>} null when authorized
 */
async function authorityFailure(
  db: Kysely<DB>,
  chatId: string,
  requesterId: string,
  requesterRole: string | null | undefined,
): Promise<ChatOwnersOpOutcome | null> {
  if (can(requesterRole, "admin.chat",)) { return null; }

  const { isChatOwner, } = await import("./owners-core");
  if (await isChatOwner(db, chatId, requesterId,)) { return null; }

  const chat = await db.selectFrom("chats",).select("id",).where("id", "=", chatId,).executeTakeFirst();
  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  return {
    ok: false,
    error: { code: "forbidden", message: "Only a chat owner or an admin may manage chat owners", },
  };
}

/**
 * Grant a user co-ownership. Resolves the target actor to its owning user
 * (transfer-path mapping), auto-invites non-participants with
 * `role_in_chat = "owner"`, refuses duplicates and the MAX_CHAT_OWNERS cap.
 * @param {Kysely<DB>} db
 * @param {AddChatOwnerOptions} opts
 * @returns {Promise<ChatOwnersOpOutcome>}
 */
export async function addChatOwner(db: Kysely<DB>, opts: AddChatOwnerOptions,): Promise<ChatOwnersOpOutcome> {
  const { chatId, requesterId, requesterRole, actorId, } = opts;

  const denied = await authorityFailure(db, chatId, requesterId, requesterRole,);
  if (denied) { return denied; }

  const chat = await db.selectFrom("chats",).select(["id", "created_by",],).where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return { ok: false, error: { code: "not_found", message: "Chat not found", }, }; }

  const targetUserId = await resolveActorOwningUser(db, actorId,);
  if (!targetUserId) {
    return { ok: false, error: { code: "not_found", message: "Target actor not found", }, };
  }

  const existing = await db
    .selectFrom("chat_owners",).select("user_id",)
    .where("chat_id", "=", chatId,).where("user_id", "=", targetUserId,)
    .executeTakeFirst();

  if (existing || chat.created_by === targetUserId) {
    return { ok: false, error: { code: "bad_request", message: "User is already an owner of this chat", }, };
  }

  const participant = await db
    .selectFrom("chat_participants",).select("actor_id",)
    .where("chat_id", "=", chatId,).where("actor_id", "=", actorId,)
    .executeTakeFirst();

  const autoInvited = !participant;
  const reason = opts.reason?.trim().slice(0, 500,) ?? null;
  const now = new Date().toISOString();

  try {
    const owners = await db.transaction().execute(async (trx,) => {
      await materializeCreatorOwnerRow(trx, chatId, chat.created_by,);

      const rows = await trx.selectFrom("chat_owners",).select("user_id",)
        .where("chat_id", "=", chatId,).execute();

      if (rows.length >= MAX_CHAT_OWNERS) {
        throw new Error("chat-owners-cap-reached",);
      }

      if (autoInvited) {
        await trx.insertInto("chat_participants",).values({
          chat_id: chatId,
          actor_id: actorId,
          role_in_chat: ChatParticipantRole.Owner,
          joined_at: now,
          initiative: 0,
          talkativity: 50,
        },).execute();
      } else {
        await trx.updateTable("chat_participants",)
          .set({ role_in_chat: ChatParticipantRole.Owner, },)
          .where("chat_id", "=", chatId,).where("actor_id", "=", actorId,).execute();
      }

      await trx.insertInto("chat_owners",).values({
        chat_id: chatId,
        user_id: targetUserId,
        granted_by: requesterId,
        reason,
      },).execute();

      const ownersAfter = await listOwnerUserIds(trx, chatId,);
      const event: OwnersChangeEvent = {
        chatId,
        action: "chat_owner_added",
        userId: targetUserId,
        performedBy: requesterId,
        owners: ownersAfter,
        autoInvited,
        reason,
      };

      await writeOwnersAuditRow(trx, event, now,);

      return ownersAfter;
    },);

    emitOwnersChangeNotifications(db, {
      chatId,
      action: "chat_owner_added",
      userId: targetUserId,
      performedBy: requesterId,
      owners,
      autoInvited,
      reason,
    },);

    return { ok: true, result: { chatId, userId: targetUserId, owners, autoInvited, }, };
  } catch (err) {
    if (err instanceof Error && err.message === "chat-owners-cap-reached") {
      return {
        ok: false,
        error: { code: "bad_request", message: `Chat already has the maximum of ${MAX_CHAT_OWNERS} owners`, },
      };
    }

    ownershipLogger().error("addChatOwner failed", err instanceof Error ? err : new Error(String(err,),), { chatId, },);
    return { ok: false, error: { code: "bad_request", message: "Add owner failed; transaction rolled back", }, };
  }
}

/**
 * Remove a user from the owners set (self-removal = resign). Refuses to
 * remove the LAST remaining owner; per-row conditional DELETE inside the tx
 * gives single-winner semantics under concurrency.
 * @param {Kysely<DB>} db
 * @param {RemoveChatOwnerOptions} opts
 * @returns {Promise<ChatOwnersOpOutcome>}
 */
export async function removeChatOwner(db: Kysely<DB>, opts: RemoveChatOwnerOptions,): Promise<ChatOwnersOpOutcome> {
  const { chatId, requesterId, requesterRole, userId, } = opts;

  const denied = await authorityFailure(db, chatId, requesterId, requesterRole,);
  if (denied) { return denied; }

  const chat = await db.selectFrom("chats",).select(["id", "created_by",],).where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return { ok: false, error: { code: "not_found", message: "Chat not found", }, }; }

  const reason = opts.reason?.trim().slice(0, 500,) ?? null;
  const now = new Date().toISOString();
  const lastOwnerError: ServiceError = {
    code: "bad_request",
    message: "Cannot remove the last remaining owner of a chat",
  };

  try {
    const owners = await db.transaction().execute(async (trx,) => {
      await materializeCreatorOwnerRow(trx, chatId, chat.created_by,);

      const rows = await trx.selectFrom("chat_owners",).select("user_id",)
        .where("chat_id", "=", chatId,).execute();

      if (!rows.some((r,) => r.user_id === userId)) {
        throw new Error("chat-owners-not-a-member",);
      }

      if (rows.length <= 1) { throw new Error("chat-owners-last-owner",); }

      const deleted = await trx.deleteFrom("chat_owners",)
        .where("chat_id", "=", chatId,).where("user_id", "=", userId,)
        .executeTakeFirst();

      if (Number(deleted.numDeletedRows ?? 0,) === 0) { throw new Error(CONCURRENT_MODIFICATION,); }

      await demoteOwnerParticipantRole(trx, chatId, userId,);

      const ownersAfter = await listOwnerUserIds(trx, chatId,);
      const event: OwnersChangeEvent = {
        chatId,
        action: "chat_owner_removed",
        userId,
        performedBy: requesterId,
        owners: ownersAfter,
        autoInvited: false,
        reason,
      };

      await writeOwnersAuditRow(trx, event, now,);

      return ownersAfter;
    },);

    emitOwnersChangeNotifications(db, {
      chatId,
      action: "chat_owner_removed",
      userId,
      performedBy: requesterId,
      owners,
      autoInvited: false,
      reason,
    },);

    return { ok: true, result: { chatId, userId, owners, }, };
  } catch (err) {
    if (!(err instanceof Error)) {
      return { ok: false, error: { code: "bad_request", message: "Remove owner failed", }, };
    }

    if (err.message === "chat-owners-last-owner") { return { ok: false, error: lastOwnerError, }; }
    if (err.message === "chat-owners-not-a-member") {
      return { ok: false, error: { code: "bad_request", message: "User is not an owner of this chat", }, };
    }

    if (err.message === CONCURRENT_MODIFICATION) {
      ownershipLogger().warn("owners-set change lost concurrency race", { chatId, userId, },);
      return {
        ok: false,
        error: { code: "bad_request", message: "Chat owners changed concurrently; refresh and retry", },
      };
    }

    ownershipLogger().error("removeChatOwner failed", err, { chatId, },);
    return { ok: false, error: { code: "bad_request", message: "Remove owner failed; transaction rolled back", }, };
  }
}
