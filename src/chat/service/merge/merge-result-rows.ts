// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Result-row insertion for content merges (FEA-2026-047). Split from
 * `merge-store.ts` to stay under the 250-line budget.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { uid, } from "../../../utils";
import { isSwipeIndexUniqueViolation, retryBounded, } from "../../../utils/swipe-retry";

/**
 * Insert result message rows as children of the LCA, with `merge_id` set
 * and swipe-race retry on the `(chat_id, parent_id, swipe_index)` unique.
 * @param database
 * @param params
 * @param params.chatId
 * @param params.baseMessageId
 * @param params.mergeId
 * @param params.actorId
 * @param params.rows
 * @returns {Promise<string[]>} inserted message ids in ordinal order
 * @throws {Error} when the swipe-race retry budget is exhausted
 */
export async function insertResultRows(
  database: Kysely<DB>,
  params: {
    chatId: string;
    baseMessageId: string;
    mergeId: string;
    actorId: string;
    rows: {
      ordinal: number;
      role: string;
      storedContent: string;
      storedKeyId: string | null;
      storedPlaintext: string | null;
      contentEncoding: string;
    }[];
  },
): Promise<string[]> {
  const { chatId, baseMessageId, mergeId, actorId, rows, } = params;
  const ids: string[] = [];

  for (const row of rows) {
    const id = uid();
    const idempotencyKey = `merge:${mergeId}:${row.ordinal}`;

    const outcome = await retryBounded({
      attempts: 8,
      isRetryable: isSwipeIndexUniqueViolation,
      onAttempt: async () => {
        await database
          .insertInto("messages",)
          .values({
            id,
            chat_id: chatId,
            actor_id: actorId,
            parent_id: baseMessageId,
            role: row.role as never,
            content: row.storedContent,
            key_id: row.storedKeyId,
            content_encoding: row.contentEncoding as never,
            idempotency_key: idempotencyKey,
            merge_id: mergeId,
          },)
          .execute();
      },
    },);

    if (!outcome.ok) {
      throw new Error(`Swipe-race retry exhausted for merge result row ${row.ordinal}`,);
    }

    ids.push(id,);
  }

  return ids;
}
