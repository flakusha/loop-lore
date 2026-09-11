// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotation history (AC7 of TASK-chat-feature-encryption-key-rotation).
 *
 * Helpers for appending rows to the `rotation_history` table.
 * Currently only `rotateKeyOnLeave` writes rows; future rotation
 * triggers (`distributeKeysOnJoin` collisions, scheduled rekeys, manual
 * rotations) will get their own helpers here.
 *
 * Audit writes are best-effort: callers invoke these AFTER the
 * rotation transaction has committed. A failed audit insert does NOT
 * roll back the rotation.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { log, } from "./log";

/**
 * Append-only audit row for a `rotateKeyOnLeave` rotation. Best-effort:
 * a failed insert is logged but does NOT throw.
 *
 * @param database - Writable database handle. Must be a connection-level
 *   handle (not a transaction); this is invoked AFTER the rotation
 *   transaction has already committed.
 * @param audit - Row payload. `actorId` is the participant who left
 *   (`null` for non-actor triggers).
 */
export async function recordRotationAuditLeave(
  database: Kysely<DB>,
  audit: {
    chatId: string;
    actorId: string | null;
    oldKeyId: string;
    newKeyId: string;
    messagesReEncrypted: number;
  },
): Promise<void> {
  try {
    await database
      .insertInto("rotation_history",)
      .values({
        id: crypto.randomUUID(),
        chat_id: audit.chatId,
        actor_id: audit.actorId,
        reason: "leave",
        old_key_id: audit.oldKeyId,
        new_key_id: audit.newKeyId,
        messages_re_encrypted: audit.messagesReEncrypted,
      },)
      .execute();
  } catch (auditErr) {
    log().error(
      "rotation_history insert failed",
      auditErr instanceof Error ? auditErr : new Error(String(auditErr,),),
      audit,
    );
  }
}
