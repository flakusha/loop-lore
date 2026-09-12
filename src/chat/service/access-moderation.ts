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
 * transfer. Any participant currently flagged as GM (`role_in_chat = "gm"`)
 * loses the role if they are neither the new chat owner nor a chat-admin
 * (`can(role, "admin.chat")`). Idempotent: callers may invoke this on every
 * transfer; it only touches rows that need to change.
 *
 * Best-effort reconciliation: callers MUST wrap this in a try/catch so a
 * single failure does not roll back a successful ownership transfer.
 * @param database
 * @param chatId
 * @param previousOwnerId Owner before the transfer (informational).
 * @param newOwnerId Owner after the transfer (preserved GM if they were one).
 * @throws {Error} When the Kysely update fails; the caller is expected to
 *   log + swallow so the transfer itself is not rolled back.
 */
export async function reconcileModeratorGrants(
  database: Kysely<DB>,
  chatId: string,
  previousOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  const log = getLogger().child({ module: "chat-access", },);
  log.debug("reconciling moderator grants", { chatId, previousOwnerId, newOwnerId, },);

  const gmParticipants = await database
    .selectFrom("chat_participants",)
    .select(["actor_id", "role_in_chat",],)
    .where("chat_id", "=", chatId,)
    .where("role_in_chat", "=", ChatParticipantRole.Gm,)
    .execute();

  if (gmParticipants.length === 0) { return; }

  const demoteIds: string[] = [];
  for (const participant of gmParticipants) {
    if (participant.actor_id === newOwnerId) { continue; }
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
