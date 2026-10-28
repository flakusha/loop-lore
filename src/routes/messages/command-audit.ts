// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Invocation audit for assistant command dispatch (epic principle:
 * "Deterministic + replayable"). Every HANDLED dispatch emits exactly one
 * structured `assistant_command_invoked` event carrying the caller, the
 * command token args, and a sha256 output hash over the canonical JSON of
 * the response triple {systemMessage, action, actionPayload} — identical
 * inputs always yield identical hashes, so replays are detectable. Message
 * content beyond the short slash-command tokens is never logged.
 */

import { createHash, } from "node:crypto";
import type { CommandResult, } from "../../assistant/commands/registry";
import { canonicalJSON, } from "../../hash/record-hash";
import { getLogger, type Logger, } from "../../logger";

/** One handled invocation to audit. */
export interface CommandInvocationAudit {
  /** Command name (registered slash command, or the synthetic "workflow") */
  command: string;
  /** Authenticated caller */
  userId: string;
  /** Slash-command tokens as parsed; workflow dispatches have none */
  args: string[];
  /** The handled result whose response triple is hashed */
  result: CommandResult;
}

/** Lazy logger accessor — getLogger() throws before createLogger() (tests). */
function auditLog(): Logger {
  return getLogger().child({ module: "assistant-commands", },);
}

/**
 * Emit the single per-invocation audit event. Never throws: the command has
 * already run and its side effects must not be masked by an audit failure.
 * A handler that THREW was already converted to a failure result by
 * dispatchCommand, so failures ARE audited (the failure message rides inside
 * the hashed systemMessage).
 * @param invocation - command, caller, args, and handled result
 */
export function auditCommandInvocation(invocation: CommandInvocationAudit,): void {
  const { command, userId, args, result, } = invocation;
  const outputHash = createHash("sha256",)
    .update(canonicalJSON({
      action: result.action ?? null,
      actionPayload: result.actionPayload ?? null,
      systemMessage: result.systemMessage ?? null,
    },),)
    .digest("hex",);

  try {
    auditLog().info("assistant command invoked", {
      args,
      command,
      event: "assistant_command_invoked",
      outputHash,
      userId,
    },);
  } catch {
    // Logger not initialized (or transport threw) — audit must not break dispatch.
  }
}
