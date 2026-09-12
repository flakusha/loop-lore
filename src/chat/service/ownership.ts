// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat ownership transfer service (transactional core).
 *
 * Flips `chats.created_by` to the new owner (auto-inviting non-participants
 * with `role_in_chat = "owner"` first); demotes the previous owner to `member`.
 * Authority: admin OR the current owner. Writes one `log_entries` row;
 * notifications live in ./ownership-events. Types in ./ownership-types.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { can, } from "../../users/permissions";
import { checkChatSettingsAccess, reconcileModeratorGrants, } from "./access";
import { buildOwnershipAuditMeta, emitOwnershipTransferNotifications, } from "./ownership-events";
import type { TransferOwnershipOptions, TransferOwnershipOutcome, } from "./ownership-types";

export type { TransferOwnershipOptions, TransferOwnershipOutcome, TransferOwnershipResult, } from "./ownership-types";

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

  // Admin bypass first: the helper below only consults creator + role_in_chat.
  const isAdmin = can(requesterRole, "admin.chat",);
  if (!isAdmin) {
    const settings = await checkChatSettingsAccess(db, chatId, requesterId, requesterRole,);
    if (!settings.ok) {
      return settings;
    }
  }

  // Sequential reads so a missing chat surfaces before we probe participants.
  const chat = await db
    .selectFrom("chats",)
    .select(["id", "created_by",],)
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

  if (previousOwnerId === newOwnerId) {
    return {
      ok: false,
      error: { code: "bad_request", message: "New owner is already the current owner", },
    };
  }

  // Only the current owner or an admin may transfer — a delegated
  // `role_in_chat = 'owner'` grant cannot pass the chat around.
  // TOCTOU guard is the conditional flip inside the tx below.
  if (!isAdmin && requesterId !== previousOwnerId) {
    return {
      ok: false,
      error: { code: "forbidden", message: "Only the current owner or an admin may transfer ownership", },
    };
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
      return {
        ok: false,
        error: { code: "not_found", message: "New owner actor not found", },
      };
    }
  }

  const autoInvited = !newOwnerParticipant;
  const now = new Date().toISOString();
  const reason = opts.reason?.trim().slice(0, 500,) ?? null;

  const auditMeta = buildOwnershipAuditMeta({ chatId, previousOwnerId, newOwnerId, autoInvited, reason, },);
  const CONCURRENT_MODIFICATION = "chat-ownership-concurrent-modification";
  try {
    const outcome = await db.transaction().execute(async (trx,) => {
      // Linearization point: zero rows ⇒ a concurrent transfer won; throw
      // before writing anything so the loser leaves no partial state.
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

    emitOwnershipTransferNotifications(db, {
      chatId,
      previousOwnerId: outcome.previousOwnerId,
      newOwnerId: outcome.newOwnerId,
      autoInvited: outcome.autoInvited,
      reason,
    },);

    // Best-effort moderator grant reconciliation: a previous GM grant may
    // outlive a chat's ownership transfer. Re-evaluation runs outside the
    // ownership tx; failures are logged but never roll back the transfer
    // itself (the new owner still takes the seat even if cleanup misses).
    try {
      await reconcileModeratorGrants(db, chatId, previousOwnerId, outcome.newOwnerId,);
    } catch (reconcileErr) {
      ownershipLogger().error(
        "moderator grant reconciliation failed",
        reconcileErr instanceof Error ? reconcileErr : new Error(String(reconcileErr,),),
        { chatId, previousOwnerId, newOwnerId: outcome.newOwnerId, },
      );
    }

    return { ok: true, result: outcome, };
  } catch (err) {
    if (err instanceof Error && err.message === CONCURRENT_MODIFICATION) {
      // Audit evidence for the loser (AC: concurrent attempts resolve to a
      // single winner with evidence): the winner's log_entries row shows who
      // won; this warn line records who lost and when.
      ownershipLogger().warn("ownership transfer lost concurrency race", {
        chatId,
        requesterId,
        attemptedNewOwnerId: newOwnerId,
        previousOwnerId,
      },);
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
