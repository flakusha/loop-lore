// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pipe-chain dispatch for `cmd1 | cmd2` slash commands. Each stage's
 * emitted text feeds the next stage's `{{pipe}}` macro; a failed, denied or
 * unhandled stage aborts the chain — later stages never run.
 */

import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import { MAX_PIPE_STAGES, pipeTextOf, splitPipeChain, } from "../../assistant/commands/pipe";
import type { CommandContext, } from "../../assistant/commands/registry";
import { getCommand, } from "../../assistant/commands/registry";
import { commandMacroRegistry, } from "../../assistant/macro/command-macros";
import { expandMacros, } from "../../assistant/macro/engine";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { fetchDispatchContext, insertCommandSystemMessage, } from "./command-context";
import { type CommandStageOutcome, runCommandStage, } from "./command-run";
import { buildCommandContext, commandResponse, type DispatchOutcome, } from "./command-shared";
import { log, } from "./helpers";

/** Expand macros against the dispatch context, binding the pipe value. */
function expandSegment(segment: string, ctx: CommandContext, pipe: string,): string {
  return expandMacros(segment, commandMacroRegistry({ ctx, pipe, },),);
}

/** A chain stage that parsed before expansion but broke after it. */
function expansionBroken(commandName: string, segment: string,): CommandStageOutcome {
  return {
    status: "aborted",
    reason: "invalid",
    commandName,
    result: {
      handled: true,
      systemMessage: `**Command failed:** macro expansion of \`${segment}\` no longer resolves to a command.`,
    },
  };
}

/**
 * Run a `cmd1 | cmd2` chain. Stages are validated (all must be registered
 * commands, at most {@link MAX_PIPE_STAGES}) BEFORE any of them runs, so a
 * malformed chain fails without side effects; runtime failures abort the
 * chain after the stages that already ran.
 * @param database - Kysely instance
 * @param config - Application config
 * @param actorId - Calling actor id
 * @param chatId - Target chat
 * @param content - Raw pipe content (mention already stripped)
 * @returns the dispatch outcome
 */
export async function dispatchPipeChain(
  database: Kysely<DB>,
  config: Config,
  actorId: string,
  chatId: string,
  content: string,
): Promise<DispatchOutcome> {
  const segments = splitPipeChain(content,).map((segment,) => segment.trim());
  if (segments.length > MAX_PIPE_STAGES) {
    return commandResponse("pipe", {
      handled: true,
      systemMessage: `**Pipe failed:** a chain may hold at most ${MAX_PIPE_STAGES} stages (got ${segments.length}).`,
    },);
  }

  const stageNames: string[] = [];
  for (const [index, segment,] of segments.entries()) {
    const parsed = parseCommand(segment,);
    const name = parsed?.command ?? "";
    if (!parsed || getCommand(name,) === undefined) {
      // A leading segment that is not a command means the `|` belongs to
      // ordinary text — the dispatch falls through instead of claiming it.
      if (index === 0) { return { handled: false, }; }
      return commandResponse("pipe", {
        handled: true,
        systemMessage: `**Pipe failed:** stage ${index + 1} \`${segment}\` is not a command.`,
      },);
    }

    stageNames.push(name,);
  }

  const dispatch = await fetchDispatchContext(database, chatId, actorId,);
  const ctx = buildCommandContext({ chatId, database, config, dispatch, userId: actorId, },);

  let pipeIn = "";
  const outputs: string[] = [];
  let lastAction: string | undefined;
  let lastPayload: Record<string, unknown> | undefined;
  let aborted: CommandStageOutcome | undefined;

  for (const [index, segment,] of segments.entries()) {
    if (segment.length === 0) {
      aborted = {
        status: "aborted",
        reason: "invalid",
        commandName: stageNames[index] ?? "",
        result: { handled: true, systemMessage: `**Pipe failed:** stage ${index + 1} is empty.`, },
      };

      break;
    }

    const expanded = expandSegment(segment, ctx, pipeIn,);
    const parsed = parseCommand(expanded,);
    const name = parsed?.command ?? "";
    const outcome = parsed !== null && getCommand(name,) !== undefined
      ? await runCommandStage({ database, parsed, ctx, },)
      : expansionBroken(stageNames[index] ?? "", segment,);

    if (outcome.status === "aborted") {
      aborted = outcome;
      log().warn("pipe chain aborted at a failed stage", {
        stage: index + 1,
        command: outcome.commandName,
        reason: outcome.reason,
      },);

      break;
    }

    outputs.push(outcome.result.systemMessage ?? "",);
    lastAction = outcome.result.action;
    lastPayload = outcome.result.actionPayload;
    pipeIn = pipeTextOf(outcome.result,);
  }

  if (aborted !== undefined) { outputs.push(aborted.result.systemMessage ?? "",); }
  const systemMessage = outputs.filter((part,) => part.length > 0).join("\n\n---\n\n",);

  if (systemMessage.length > 0) {
    // Stage side effects already ran; a failed insert must not hide the
    // chain outcome as an unhandled 500.
    try {
      await insertCommandSystemMessage(database, config, chatId, actorId, systemMessage,);
    } catch (error) {
      log().warn("pipe chain system message insert failed", { error: String(error,), },);
    }
  }

  log().info("Pipe chain dispatched", {
    stages: stageNames,
    aborted: aborted?.commandName,
  },);

  return commandResponse(stageNames.join(" | ",), {
    handled: true,
    systemMessage,
    action: lastAction,
    actionPayload: lastPayload,
  },);
}
