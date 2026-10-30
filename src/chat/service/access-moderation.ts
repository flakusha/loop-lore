// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat access: GM/owner moderator-grant reconciliation.
 *
 * Extracted from `access.ts` to keep per-module file size under the 250L
 * cap (see `scripts/check-file-size.ts --strict`). `access.ts` keeps the
 * access-control checks (read/settings/online) and re-exports
 * `reconcileModeratorGrants` for back-compat with consumers that still
 * import it from `./access`.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/**
 * Re-evaluate which participants hold GM-tier grants after an ownership
 * change. Any participant currently flagged as GM (`role_in_chat = "gm"`)
 * loses the role unless their ACTOR's owning user is in the chat's owners
 * set (`chat_owners`), or — for chats whose owners set has not been
 * materialized — is the single new owner of the just-completed transfer.
 * Idempotent: callers may invoke this on every transfer; it only touches
 * rows that need to change.
 *
 * Best-effort reconciliation: callers MUST wrap this in a try/catch so a
 * single failure does not roll back a successful ownership transfer.
 * @param database
 * @param chatId
 * @param previousOwnerId Owner before the transfer (informational).
 * @param newOwnerId Owner after the transfer (fallback sole owner when the
 *   chat has no `chat_owners` rows yet).
 * @throws {Error} When the Kysely update fails; the caller is expected to
 *   log + swallow so the transfer itself is not rolled back.
 * @returns {Promise<void>}
 */
export async function reconcileModeratorGrants(
  database: Kysely<DB>,
  chatId: string,
  previousOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  const log = getLogger().child({ module: "chat-access", },);
  log.debug("reconciling moderator grants", { chatId, previousOwnerId, newOwnerId, },);

  // Owners set; unmaterialized chats fall back to the transfer's new owner.
  const ownerRows = await database
    .selectFrom("chat_owners",)
    .select("user_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  const ownerUserIds = ownerRows.length > 0
    ? new Set(ownerRows.map((r,) => r.user_id),)
    : new Set([newOwnerId,],);

  const gmParticipants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select([
      "chat_participants.actor_id as actor_id",
      "actors.user_id as actor_user_id",
      "actors.owner_id as actor_owner_id",
    ],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.role_in_chat", "=", ChatParticipantRole.Gm,)
    .execute();

  if (gmParticipants.length === 0) { return; }

  const demoteIds: string[] = [];
  for (const participant of gmParticipants) {
    const owningUser = participant.actor_user_id ?? participant.actor_owner_id ?? participant.actor_id;
    if (ownerUserIds.has(owningUser,)) { continue; }
    demoteIds.push(participant.actor_id,);
  }

  if (demoteIds.length === 0) { return; }

  await database
    .updateTable("chat_participants",)
    .set({ role_in_chat: ChatParticipantRole.Member, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "in", demoteIds,)
    .where("role_in_chat", "=", ChatParticipantRole.Gm,)
    .execute();

  log.info("moderator grants reconciled", { chatId, demoted: demoteIds.length, },);
}
