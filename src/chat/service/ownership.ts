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
import type { TransferOwnershipOptions, TransferOwnershipOutcome, TransferOwnershipResult, } from "./ownership-types";
import type { ServiceError, } from "./types";

export type { TransferOwnershipOptions, TransferOwnershipOutcome, TransferOwnershipResult, } from "./ownership-types";

const ownershipLogger = (): ReturnType<typeof getLogger> => getLogger().child({ module: "chat-ownership", },);
const CONCURRENT_MODIFICATION = "chat-ownership-concurrent-modification";

/** Transaction body. Throws CONCURRENT_MODIFICATION on a lost TOCTOU race. */
async function executeTransferTx(
  trx: Kysely<DB>,
  params: {
    chatId: string;
    previousOwnerId: string;
    newOwnerId: string;
    autoInvited: boolean;
    now: string;
    auditMeta: ReturnType<typeof buildOwnershipAuditMeta>;
    requesterId: string;
  },
): Promise<TransferOwnershipResult> {
  const { chatId, previousOwnerId, newOwnerId, autoInvited, now, auditMeta, requesterId, } = params;
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
}

/** Notifications + moderator-grant reconciliation (best-effort). */
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

/** Map a thrown tx error to a ServiceResult. */
function interpretTransferError(
  err: unknown,
  ctx: { chatId: string; requesterId: string; newOwnerId: string; previousOwnerId: string | undefined },
): TransferOwnershipOutcome {
  if (err instanceof Error && err.message === CONCURRENT_MODIFICATION) {
    ownershipLogger().warn("ownership transfer lost concurrency race", {
      chatId: ctx.chatId,
      requesterId: ctx.requesterId,
      attemptedNewOwnerId: ctx.newOwnerId,
      previousOwnerId: ctx.previousOwnerId,
    },);
    const concurrentError: ServiceError = {
      code: "bad_request",
      message: "Chat ownership changed concurrently; refresh and retry",
    };
    return { ok: false, error: concurrentError, };
  }
  ownershipLogger().error(
    "ownership transfer failed",
    err instanceof Error ? err : new Error(String(err,),),
    { chatId: ctx.chatId, },
  );
  const transferFailedError: ServiceError = {
    code: "bad_request",
    message: "Transfer failed; transaction rolled back",
  };
  return { ok: false, error: transferFailedError, };
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
    // TODO(chat-ownership): ownerless chats stay stuck — the previous-owner check below
    // returns bad_request when chats.created_by is null (unreachable given the schema
    // guard, but defense-in-depth). Decide the recovery path for that branch.
    const selfError: ServiceError = { code: "bad_request", message: "Cannot transfer ownership to yourself", };
    return { ok: false, error: selfError, };
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

  const previousOwnerId = chat.created_by;
  if (!previousOwnerId) {
    const ownerlessError: ServiceError = { code: "bad_request", message: "Chat has no current owner", };
    return { ok: false, error: ownerlessError, };
  }

  if (previousOwnerId === newOwnerId) {
    const sameOwnerError: ServiceError = { code: "bad_request", message: "New owner is already the current owner", };
    return { ok: false, error: sameOwnerError, };
  }

  // Only the current owner or an admin may transfer — a delegated
  // `role_in_chat = 'owner'` grant cannot pass the chat around.
  // TOCTOU guard is the conditional flip inside the tx below.
  if (!isAdmin && requesterId !== previousOwnerId) {
    const forbiddenError: ServiceError = {
      code: "forbidden",
      message: "Only the current owner or an admin may transfer ownership",
    };
    return { ok: false, error: forbiddenError, };
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

  const autoInvited = !newOwnerParticipant;
  const now = new Date().toISOString();
  const reason = opts.reason?.trim().slice(0, 500,) ?? null;

  const auditMeta = buildOwnershipAuditMeta({ chatId, previousOwnerId, newOwnerId, autoInvited, reason, },);
  try {
    const outcome: TransferOwnershipResult = await db.transaction().execute((trx,) =>
      executeTransferTx(trx, { chatId, previousOwnerId, newOwnerId, autoInvited, now, auditMeta, requesterId, },)
    );
    await runPostTransferHooks(db, outcome, reason, chatId,);
    return { ok: true, result: outcome, };
  } catch (err) {
    return interpretTransferError(err, { chatId, requesterId, newOwnerId, previousOwnerId, },);
  }
}
