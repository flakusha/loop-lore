// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { getLogger, } from "../../logger";
import { logNsfwEvent, } from "../../middleware/nsfw-gate/logging";
import type { NsfwGateReason, } from "../../nsfw/pii-redaction";
import type { HookContext, } from "./types";

/**
 * Audit every gate decision through `logNsfwEvent`. Wrapped in try/catch so
 * a logging failure cannot itself fail the gate decision.
 * @param context
 * @param action
 * @param reason
 * @param metadata
 */
export async function logGateDecision(
  context: HookContext,
  action: "allowed" | "blocked" | "warning",
  reason: NsfwGateReason,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await logNsfwEvent(context.db, {
      userId: context.userId,
      actorId: context.actorId,
      chatId: context.chatId,
      action,
      reason,
      metadata,
    },);
  } catch (error) {
    getLogger().warn("nsfw-hook: logNsfwEvent failed", { error: String(error,), },);
  }
}
