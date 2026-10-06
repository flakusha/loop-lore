// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Error mapping for the ownership-transfer transaction (split from
 * ./ownership for the file-size gate).
 */
import { getLogger, } from "../../logger";
import type { TransferOwnershipOutcome, } from "./ownership-types";
import type { ServiceError, } from "./types";

export const CONCURRENT_MODIFICATION = "chat-ownership-concurrent-modification";

export const ownershipLogger = (): ReturnType<typeof getLogger> => getLogger().child({ module: "chat-ownership", },);

/**
 * Map a thrown tx error to a ServiceResult.
 * @param err
 * @param ctx
 * @param ctx.chatId
 * @param ctx.requesterId
 * @param ctx.newOwnerId
 * @param ctx.previousOwnerId
 * @returns the failed outcome to surface to the caller
 */
export function interpretTransferError(
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
