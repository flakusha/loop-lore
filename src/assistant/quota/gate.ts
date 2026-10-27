// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command-layer quota gate: wraps {@link enforceQuota} into the
 * `CommandResult` shape the assistant handlers return, so each command is
 * one `quotaGate(...)` call at the top of the handler.
 */

import { type CommandResult, } from "../commands/registry";
import { enforceQuota, QuotaExceededError, type QuotaOperation, } from "./engine";

/**
 * Enforce quota for a command; on rejection return the user-facing denial,
 * otherwise null (proceed). Never throws.
 * @param userId - authenticated caller
 * @param operation - the quota-consuming operation about to run
 * @returns a denial `CommandResult`, or null when quota was deducted
 * @throws {Error} only when the gate observes a non-quota error
 */
export function quotaGate(userId: string | null, operation: QuotaOperation,): CommandResult | null {
  try {
    enforceQuota(userId, operation,);
    return null;
  } catch (error) {
    if (!(error instanceof QuotaExceededError)) { throw error; }

    return {
      systemMessage:
        `**Quota exceeded for \`${operation}\`.** Nothing ran — the per-user window resets automatically. Try again later.`,
      handled: true,
    };
  }
}
