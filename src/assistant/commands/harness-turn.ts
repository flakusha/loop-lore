// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// `/harness <profile> <prompt>` - run one turn on an external ACP harness
// (TASK-harness-production-dispatch-path-runturn-caller-tasktype-mem).
//
// This is the production caller of the outbound ACP stack: it hands the
// prompt to the composed runtime, and the turn's transcript lands in this
// chat as message rows (the assistant answer plus one row per finished tool
// call). The isolation gate, the ToS dispatch guard and the permission queue
// all sit inside the dispatch - this command never reaches around them.

import { ChatParticipantRole, } from "../../db/enums";
import { getHarnessAdminFileConfig, } from "../../integrations/harness/admin-settings";
import { dispatchHarnessTurn, HarnessDispatchError, } from "../../integrations/harness/dispatch";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/** A harness turn may run for minutes - the guard's default 10s is too short. */
const HARNESS_LIMITS = { timeoutMs: 600_000, memoryMb: 512, };

/** How to call the command, with the profiles this server knows. */
function usage(): string {
  const profiles = getHarnessAdminFileConfig().profiles.map((profile,) => profile.name);
  const known = profiles.length > 0 ? profiles.join(", ",) : "none configured";
  return [
    "**Usage:** `/harness <profile> <prompt>`",
    "",
    `Runs one turn on an external ACP harness and answers in this chat. Configured profiles: ${known}.`,
  ].join("\n",);
}

/**
 * Run the turn the caller asked for, or explain why it did not run.
 * @param args - the profile name, then the prompt words
 * @param ctx - the chat binding and the caller's identity
 * @returns the command result (the turn's answer lands as chat rows).
 */
async function runHarnessTurn(args: string[], ctx: CommandContext,): Promise<CommandResult> {
  const runtime = getHarnessRuntime();
  if (!runtime) {
    return {
      handled: true,
      systemMessage: "**Harness unavailable:** the ACP integration is disabled or not configured.",
    };
  }

  const [profile, ...rest] = args;
  const prompt = rest.join(" ",).trim();
  if (!profile || !prompt) { return { handled: true, systemMessage: usage(), }; }
  if (!ctx.db || !ctx.userId) {
    return {
      handled: true,
      systemMessage: "**Harness unavailable:** this chat has no authenticated actor.",
    };
  }

  try {
    const outcome = await dispatchHarnessTurn({
      runtime,
      role: ctx.userRole ?? null,
      userId: ctx.userId,
      profile,
      prompt,
      database: ctx.db,
      chatId: ctx.chatId,
      // The turn answers AS the chat's character; without one (a chat with no
      // persona) the caller's own actor carries the rows.
      actorId: ctx.currentCharacter?.id ?? ctx.userId,
    },);

    return {
      handled: true,
      systemMessage:
        `**Harness turn complete** - ${outcome.turn.profile} / ${outcome.turn.tier} / ${outcome.turn.model}.`,
    };
  } catch (error) {
    if (error instanceof HarnessDispatchError) {
      return {
        handled: true,
        systemMessage: `**Harness dispatch refused** (${error.code}): ${error.message}`,
      };
    }

    throw error;
  }
}

registerCommand("harness", runHarnessTurn, {
  requiredRole: ChatParticipantRole.Member,
  // The turn runs an external process on the server and writes into the chat:
  // admin-only (the isolation gate's role) plus the chat write.
  capabilities: ["admin-only", "write-chat",],
  limits: HARNESS_LIMITS,
},);
