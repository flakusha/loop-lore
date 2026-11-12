// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * One slash-command stage: role gate → valve resolution → capability guard →
 * handler → audit. Shared by the single-command path and every stage of a
 * `cmd1 | cmd2` pipe chain, so both paths enforce the identical contract.
 */

import type { Kysely, } from "kysely";
import type { ParsedCommand, } from "../../assistant/command-parser";
import type { CommandContext, CommandResult, } from "../../assistant/commands/registry";
import { getCommandRequirement, getCommandValves, satisfiesRole, } from "../../assistant/commands/registry";
import { resolveCommandValves, type ValveValue, } from "../../assistant/commands/valves";
import { runGuardedToolCall, } from "../../assistant/guard/pipeline";
import type { DB, } from "../../db/schema";
import { toErrorMessage, } from "../../utils";
import { auditCommandInvocation, } from "./command-audit";
import { log, } from "./helpers";

/** Inputs for one command stage. */
export interface CommandStageInput {
  database: Kysely<DB>;
  /** The parsed (already macro-expanded) command invocation. */
  parsed: ParsedCommand;
  /** The dispatch context; the runner attaches this stage's `namedArgs`. */
  ctx: CommandContext;
}

/** A resolved stage, or why the chain/single dispatch must stop. */
export type CommandStageOutcome =
  | { status: "completed"; commandName: string; result: CommandResult }
  | {
    status: "aborted";
    commandName: string;
    result: CommandResult;
    reason: "denied" | "invalid" | "threw" | "unhandled";
  };

/**
 * Attach the invocation's named arguments to the context: raw strings when
 * the command declares no valves, schema-resolved values (defaults filled,
 * numbers/booleans converted) when it does.
 * @param parsed - The parsed invocation
 * @param ctx - Base dispatch context (only `namedArgs` is written)
 * @returns the failure message, or undefined when the valves accept the args
 */
function attachNamedArgs(parsed: ParsedCommand, ctx: CommandContext,): string | undefined {
  ctx.positionalArgs = [...parsed.positional,];
  const schema = getCommandValves(parsed.command,);
  if (schema === undefined) {
    ctx.namedArgs = { ...parsed.named, };
    return undefined;
  }

  const outcome = resolveCommandValves({ command: parsed.command, schema, named: parsed.named, },);
  if (!outcome.ok) { return outcome.message; }
  ctx.namedArgs = outcome.values as Record<string, ValveValue>;
  return undefined;
}

/**
 * Run one slash-command stage through role gate, valves, capability guard
 * and handler. Denials and valve rejections happen BEFORE the handler runs
 * (the handler never sees rejected args); a thrown handler error becomes a
 * structured "Command failed" result instead of a 500.
 * @param input - Stage inputs (database, parsed command, base context)
 * @returns the stage outcome; `completed` results are audited
 */
export async function runCommandStage(input: CommandStageInput,): Promise<CommandStageOutcome> {
  const { database, parsed, ctx, } = input;
  const requiredRole = getCommandRequirement(parsed.command,);
  if (requiredRole !== undefined && !satisfiesRole(ctx.roleInChat, requiredRole,)) {
    return {
      status: "aborted",
      reason: "denied",
      commandName: parsed.command,
      result: {
        handled: true,
        systemMessage: `**Permission denied:** \`/${parsed.command}\` requires the "${requiredRole}" role.`,
      },
    };
  }

  const valveFailure = attachNamedArgs(parsed, ctx,);
  if (valveFailure !== undefined) {
    log().warn("command valves rejected the named args", { command: parsed.command, },);
    return {
      status: "aborted",
      reason: "invalid",
      commandName: parsed.command,
      result: { handled: true, systemMessage: valveFailure, },
    };
  }

  try {
    // The guard is an additional layer on top of the role gate above: it
    // checks the command's declared capabilities, then runs the handler in
    // the sandbox. A denial never reaches the handler.
    const outcome = await runGuardedToolCall({
      tool: parsed.command,
      args: parsed.args,
      ctx,
      origin: "slash-command",
    }, database,);

    if (!outcome.allowed) {
      log().warn("command denied by the capability guard", {
        command: parsed.command,
        reason: outcome.reason,
      },);

      return {
        status: "aborted",
        reason: "denied",
        commandName: parsed.command,
        result: { handled: true, systemMessage: `**Permission denied:** ${outcome.reason}`, },
      };
    }

    const result = outcome.result ?? {
      handled: true,
      systemMessage: `\`/${parsed.command}\` produced no result.`,
    };

    if (!result.handled) {
      return { status: "aborted", reason: "unhandled", commandName: parsed.command, result, };
    }

    auditCommandInvocation({ args: parsed.args, command: parsed.command, result, userId: ctx.userId ?? "", },);
    return { status: "completed", commandName: parsed.command, result, };
  } catch (error) {
    const msg = toErrorMessage(error,);
    log().warn("command handler threw", { command: parsed.command, error: msg, },);
    const result: CommandResult = { handled: true, systemMessage: `**Command failed:** ${msg}`, };
    auditCommandInvocation({ args: parsed.args, command: parsed.command, result, userId: ctx.userId ?? "", },);
    return { status: "aborted", reason: "threw", commandName: parsed.command, result, };
  }
}
