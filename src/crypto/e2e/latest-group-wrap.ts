// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 40

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { GroupWrapRow, } from "./wrap-sender-key";

/**
 * @param database
 * @param groupSessionId
 * @param recipientActorId
 * @returns void
 */
export async function latestGroupWrapForRecipient(
  database: Kysely<DB>,
  groupSessionId: string,
  recipientActorId: string,
): Promise<GroupWrapRow | null> {
  const row = await database
    .selectFrom("e2e_group_wraps",)
    .selectAll()
    .where("group_session_id", "=", groupSessionId,)
    .where("recipient_actor_id", "=", recipientActorId,)
    .orderBy("chain_index", "desc",)
    .limit(1,)
    .executeTakeFirst();
  return row
    ? {
      id: row.id,
      groupSessionId: row.group_session_id,
      recipientActorId: row.recipient_actor_id,
      wrappedKey: row.wrapped_key,
      senderEphPubJwk: row.sender_eph_pub_jwk,
      chainIndex: row.chain_index,
    }
    : null;
}
