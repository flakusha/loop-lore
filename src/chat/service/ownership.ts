// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat ownership transfer service (transactional core).
 *
 * Transfers ownership within the `chat_owners` set (epic-chat-multi-ownership
 * cutover): revokes the previous owner's row, grants the new owner
 * (auto-inviting non-participants with `role_in_chat = "owner"`), demotes the
 * previous owner's participant role to `member`. `chats.created_by` is a
 * frozen creator record and is NEVER mutated. Authority: admin OR any
 * current owner. Writes one `log_entries` row; notifications live in
 * ./ownership-events. Types in ./ownership-types.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";

import { can, } from "../../users/permissions";
import { reconcileModeratorGrants, } from "./access";
import { CONCURRENT_MODIFICATION, interpretTransferError, ownershipLogger, } from "./ownership-errors";
import { buildOwnershipAuditMeta, emitOwnershipTransferNotifications, } from "./ownership-events";
import type { TransferOwnershipOptions, TransferOwnershipOutcome, TransferOwnershipResult, } from "./ownership-types";
import type { ServiceError, } from "./types";

export type { TransferOwnershipOptions, TransferOwnershipOutcome, TransferOwnershipResult, } from "./ownership-types";

/**
 * Transaction body. Throws CONCURRENT_MODIFICATION on a lost TOCTOU race.
 * @param trx
 * @param params
 * @param params.chatId
 * @param params.previousOwnerId
 * @param params.newOwnerId
 * @param params.autoInvited
 * @param params.now
 * @param params.auditMeta
 * @param params.requesterId
 */
async function executeTransferTx(
  trx: Kysely<DB>,
  params: {
    chatId: string;
    previousOwnerId: string;
    newOwnerId: string;
    /** Owning users.id of the new-owner actor — granted a chat_owners row (created_by is never written). */
    newOwnerUserId: string;
    autoInvited: boolean;
    now: string;
    auditMeta: ReturnType<typeof buildOwnershipAuditMeta>;
    requesterId: string;
    /** Admin-initiated transfer: clear the whole owners set (legacy reassignment). */
    revokeAllOwners: boolean;
  },
): Promise<TransferOwnershipResult> {
  const {
    chatId,
    previousOwnerId,
    newOwnerId,
    newOwnerUserId,
    autoInvited,
    now,
    auditMeta,
    requesterId,
    revokeAllOwners,
  } = params;

  // Touch updated_at only — created_by is the frozen creator record.
  await trx
    .updateTable("chats",)
    .set({ updated_at: now, },)
    .where("id", "=", chatId,)
    .execute();

  // Owners-set swap. The conditional DELETE is the TOCTOU guard: a lost
  // race sees zero deleted rows and aborts (never last-writer-wins).
  // Admin-initiated transfers clear the whole set (legacy single-owner
  // reassignment semantics); owner-initiated ones hand over only the
  // requester's own ownership, preserving co-owners.
  const revoked = revokeAllOwners
    ? await trx.deleteFrom("chat_owners",).where("chat_id", "=", chatId,).executeTakeFirst()
    : await trx
      .deleteFrom("chat_owners",)
      .where("chat_id", "=", chatId,)
      .where("user_id", "=", previousOwnerId,)
      .executeTakeFirst();

  if (Number(revoked.numDeletedRows ?? 0,) === 0) {
    throw new Error(CONCURRENT_MODIFICATION,);
  }

  await trx
    .insertInto("chat_owners",)
    .values({
      chat_id: chatId,
      user_id: newOwnerUserId,
      granted_by: requesterId,
    },)
    .execute();

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
}

/**
 * Notifications + moderator-grant reconciliation (best-effort).
 * @param db
 * @param outcome
 * @param reason
 * @param chatId
 */
async function runPostTransferHooks(
  db: Kysely<DB>,
  outcome: TransferOwnershipResult,
  reason: string | null,
  chatId: string,
): Promise<void> {
  emitOwnershipTransferNotifications(db, {
    chatId,
    previousOwnerId: outcome.previousOwnerId,
    newOwnerId: outcome.newOwnerId,
    autoInvited: outcome.autoInvited,
    reason,
  },);

  try {
    await reconcileModeratorGrants(db, chatId, outcome.previousOwnerId, outcome.newOwnerId,);
  } catch (reconcileErr) {
    ownershipLogger().error(
      "moderator grant reconciliation failed",
      reconcileErr instanceof Error ? reconcileErr : new Error(String(reconcileErr,),),
      { chatId, previousOwnerId: outcome.previousOwnerId, newOwnerId: outcome.newOwnerId, },
    );
  }
}

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
    const selfError: ServiceError = { code: "bad_request", message: "Cannot transfer ownership to yourself", };
    return { ok: false, error: selfError, };
  }

  // Sequential reads so a missing chat surfaces before we probe participants.
  const chat = await db.selectFrom("chats",).select(["id", "created_by",],).where("id", "=", chatId,)
    .executeTakeFirst();

  const newOwnerParticipant = await db.selectFrom("chat_participants",).select(["actor_id", "role_in_chat",],).where(
    "chat_id",
    "=",
    chatId,
  ).where("actor_id", "=", newOwnerId,).executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  const { isChatOwner, listOwnerUserIds, materializeCreatorOwnerRow, } = await import("./owners-core");

  // Defense-in-depth for chats created after the 082 backfill but before the
  // owners-seeding cutover: materialize the creator baseline row on first touch.
  if ((await listOwnerUserIds(db, chatId,)).length === 0 && chat.created_by) {
    await materializeCreatorOwnerRow(db, chatId, chat.created_by,);
  }

  const ownerRows = await listOwnerUserIds(db, chatId,);

  // Only a current owner or an admin may transfer. Owner-initiated transfers
  // hand over the requester's own ownership; admin-initiated ones clear the
  // whole set (legacy single-owner reassignment semantics).
  const isAdmin = can(requesterRole, "admin.chat",);
  const requesterIsOwner = await isChatOwner(db, chatId, requesterId,);

  if (!isAdmin && !requesterIsOwner) {
    const forbiddenError: ServiceError = {
      code: "forbidden",
      message: "Only the current owner or an admin may transfer ownership",
    };

    return { ok: false, error: forbiddenError, };
  }

  const previousOwnerId: string | null = requesterIsOwner
    ? requesterId
    : (ownerRows.length === 1 ? ownerRows[0]! : (chat.created_by ?? null));

  if (!previousOwnerId) {
    const ownerlessError: ServiceError = { code: "bad_request", message: "Chat has no current owner", };
    return { ok: false, error: ownerlessError, };
  }

  if (!newOwnerParticipant) {
    // Up-front FK guard (post-authority, so outsiders cannot probe actor ids):
    // a bogus newOwnerId would otherwise die on chat_participants.actor_id →
    // actors.id deep in the tx and surface as a misleading "Transfer failed" 400.
    const actorExists = await db
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", newOwnerId,)
      .executeTakeFirst();

    if (!actorExists) {
      const actorMissingError: ServiceError = { code: "not_found", message: "New owner actor not found", };
      return { ok: false, error: actorMissingError, };
    }
  }

  // chats.created_by is an FK to users.id while newOwnerId names an ACTOR
  // (chat_participants.actor_id). Resolve the actor's owning user — mirroring
  // the seeding/adoption mapping (persona actors carry user_id, adopted
  // characters carry owner_id). Writes that identify the participant keep
  // using the actor id.
  const actorRow = await db
    .selectFrom("actors",)
    .select(["user_id", "owner_id",],)
    .where("id", "=", newOwnerId,)
    .executeTakeFirst();

  const newOwnerUserId = actorRow?.user_id ?? actorRow?.owner_id ?? null;
  if (!newOwnerUserId) {
    const ownerUserError: ServiceError = {
      code: "bad_request",
      message: "New owner actor has no owning user",
    };

    return { ok: false, error: ownerUserError, };
  }

  if (ownerRows.includes(newOwnerUserId,)) {
    const sameOwnerError: ServiceError = { code: "bad_request", message: "New owner is already the current owner", };
    return { ok: false, error: sameOwnerError, };
  }

  const autoInvited = !newOwnerParticipant;
  const now = new Date().toISOString();
  const reason = opts.reason?.trim().slice(0, 500,) ?? null;

  const auditMeta = buildOwnershipAuditMeta({ chatId, previousOwnerId, newOwnerId, autoInvited, reason, },);
  try {
    const outcome: TransferOwnershipResult = await db.transaction().execute((trx,) =>
      executeTransferTx(trx, {
        chatId,
        previousOwnerId,
        newOwnerId,
        newOwnerUserId,
        autoInvited,
        now,
        auditMeta,
        requesterId,
        revokeAllOwners: isAdmin && !requesterIsOwner,
      },)
    );

    await runPostTransferHooks(db, outcome, reason, chatId,);
    return { ok: true, result: outcome, };
  } catch (err) {
    return interpretTransferError(err, { chatId, requesterId, newOwnerId, previousOwnerId, },);
  }
}
