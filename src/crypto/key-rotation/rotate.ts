// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotate a single actor's primary key.
 *
 * Post-054 stable-key design: chat keys are independent per-chat random keys
 * (deriveChatKeyForChat), NOT derived from participant actor keys. Actor key
 * rotation therefore does NOT require message re-encryption — the chat keys
 * used for message encryption are unaffected by actor key changes.
 *
 * The old actor key is atomically expired + a new one created via rotateActorKey.
 * On any failure, the error is surfaced (not swallowed).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { rotateActorKey, } from "../actor-keys";
import { log, } from "./log";
import type { RotationResult, } from "./types";

/**
 * Rotate a single actor's primary key.
 *
 * Since migration 054, messages use stable per-chat random keys
 * (deriveChatKeyForChat), not the pre-054 HKDF-from-participant-keys scheme.
 * Actor key rotation no longer requires message re-encryption — chat keys
 * are independent of actor keys.
 */
export async function rotateActorKeyAndReEncrypt(
  database: Kysely<DB>,
  actorId: string,
  smk: CryptoKey,
): Promise<RotationResult> {
  const log2 = log();

  // Get all chats this actor participates in (for reporting only).
  const participations = await database
    .selectFrom("chat_participants",)
    .select("chat_id",)
    .where("actor_id", "=", actorId,)
    .execute();

  // Rotate the actor key (atomically: expire old + create new).
  const newKeyId = await rotateActorKey({ database, actorId, smk, },);

  log2.info(
    `Rotated key for actor ${actorId}: new=${newKeyId}; ${participations.length} chats affected (no message re-encrypt needed — stable per-chat keys)`,
  );

  return {
    actorId,
    oldKeyId: "rotated",
    newKeyId,
    chatsAffected: participations.length,
    messagesReEncrypted: 0,
  };
}
