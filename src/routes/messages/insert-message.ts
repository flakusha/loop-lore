// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Transactional insert of a user-authored message row, extracted from
 * `create.ts` (which sits at the size-gate ceiling).
 *
 * Owns two invariants that must not drift apart:
 *  - the cross-chat `parentId` IDOR guard runs INSIDE the same transaction
 *    as the INSERT, closing the TOCTOU window between SELECT and INSERT
 *    (BUG-cross-chat-parentId-IDOR);
 *  - insert-level failures are mapped to their HTTP status here, so the
 *    route handler only has to branch on `ok`.
 */
import type { Kysely, } from "kysely";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { type HttpStatusCode, jsonResponse, } from "../http-utils";
import { ParentMessageNotFoundError, ParentMessageNotInChatError, } from "./parent-message-errors";
import { insertUserMessageWithRetry, SwipeInsertExhaustedError, } from "./swipe-race-insert";

/** Everything the INSERT needs; `id` is pre-allocated by the caller. */
export interface InsertUserMessageParams {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  id: string;
  parentId: string | null;
  storedContent: string;
  storedKeyId: string | null;
  storedPlaintext: string | null;
  contentEncoding: ContentEncoding;
  idempotencyKey: string | null;
  /** Writes Elysia's response status before the guard error is thrown. */
  setStatus: (status: number,) => void;
}

/**
 * `ok: false` carries the already-built HTTP response to return verbatim.
 * `ok: true` with `replayedId` means a concurrent writer already committed a
 * row covering the same (chatId, idempotencyKey): the caller must respond
 * with `replayedId` instead of the pre-allocated id.
 */
export type InsertUserMessageOutcome =
  | { ok: true; replayedId?: string }
  | { ok: false; response: Response };

/**
 * Insert the user message row, guarding `parentId` ownership inside the same
 * transaction. Unknown errors propagate to the route's error boundary.
 * @param {InsertUserMessageParams} params
 * @returns {Promise<InsertUserMessageOutcome>}
 */
export async function insertUserMessageRow(
  params: InsertUserMessageParams,
): Promise<InsertUserMessageOutcome> {
  const {
    database,
    chatId,
    actorId,
    id,
    parentId,
    storedContent,
    storedKeyId,
    storedPlaintext,
    contentEncoding,
    idempotencyKey,
    setStatus,
  } = params;

  let replayedId: string | undefined;

  try {
    await database.transaction().execute(async (trx,) => {
      if (parentId !== null) {
        const parent = await trx
          .selectFrom("messages",)
          .select("chat_id",)
          .where("id", "=", parentId,)
          .executeTakeFirst();

        if (!parent) {
          setStatus(404,);
          throw new ParentMessageNotFoundError();
        }

        if (parent.chat_id !== chatId) {
          setStatus(403,);
          throw new ParentMessageNotInChatError();
        }
      }

      const result = await insertUserMessageWithRetry(trx, {
        id,
        chatId,
        actorId,
        parentId,
        storedContent,
        storedKeyId,
        storedPlaintext,
        contentEncoding,
        idempotencyKey,
      },);

      if (result.replayedId) { replayedId = result.replayedId; }
    },);
  } catch (err) {
    if (err instanceof ParentMessageNotFoundError) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "parent_message_not_found", message: "parentId does not reference any message.", },
          404 as HttpStatusCode,
        ),
      };
    }

    if (err instanceof ParentMessageNotInChatError) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "parent_message_not_in_chat", message: "parentId belongs to a different chat.", },
          403 as HttpStatusCode,
        ),
      };
    }

    if (err instanceof SwipeInsertExhaustedError) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "service_busy", message: err.message, },
          503 as HttpStatusCode,
        ),
      };
    }

    throw err;
  }

  return { ok: true, replayedId, };
}
