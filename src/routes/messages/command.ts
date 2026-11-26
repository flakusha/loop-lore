// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Slash-command dispatch entry: a single `/cmd` (macro expansion → valve
 * resolution → guarded handler) or a `cmd1 | cmd2` pipe chain. Per-stage
 * enforcement lives in `command-run.ts`, the chain in `command-pipe.ts`,
 * chat-context reads in `command-context.ts`.
 */

import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import "../../assistant/commands/index";
import { splitPipeChain, } from "../../assistant/commands/pipe";
import type { CommandResult, } from "../../assistant/commands/registry";
import { getCommand, } from "../../assistant/commands/registry";
import {
  fillNextStep,
  formatWorkflowPreview,
} from "../../assistant/commands/workflow";
import { commandMacroRegistry, } from "../../assistant/macro/command-macros";
import { expandMacros, } from "../../assistant/macro/engine";
import { matchWorkflowIntent, matchWorkflowTrigger, } from "../../assistant/workflow-routing";
import { previewSteps, } from "../../assistant/workflow-runner";
import { getSession, startSession, } from "../../assistant/workflow-session";
import { loadPersistedSession, saveSession, } from "../../assistant/workflow-session-store";
import type { Config, } from "../../config/schema";
import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import type { DB, } from "../../db/schema";
import { stripLeadingMention, } from "../../group-chat/mention-parser";
import { CHARACTER_PICTURE_INTENT, } from "../../regex/intent";
import { auditCommandInvocation, } from "./command-audit";
import { fetchDispatchContext, insertCommandSystemMessage, } from "./command-context";
import { dispatchPipeChain, } from "./command-pipe";
import { runCommandStage, } from "./command-run";
import { buildCommandContext, commandResponse, type DispatchOutcome, } from "./command-shared";
import { log, } from "./helpers";

/**
 * The workflow branch for content that is not a registered command: an
 * active run captures the message as its next step value, otherwise a
 * trigger phrase starts a new run.
 * @returns the workflow result, or null when the message is not ours
 */
async function runWorkflowFallback(
  database: Kysely<DB>,
  chatId: string,
  effectiveContent: string,
  loadedWorkflows: readonly AssistantWorkflowConfig[],
): Promise<CommandResult | null> {
  // Rehydrate persisted runs (restart/second process) into memory before
  // deciding whether this message belongs to a workflow.
  const session = getSession(chatId,) ?? await loadPersistedSession(database, chatId, loadedWorkflows,);
  if (session) {
    // fillNextStep advances the session (fills the step) — persist the
    // advanced state, so saving must happen after it runs.
    const stepResult: CommandResult = {
      systemMessage: fillNextStep(session, effectiveContent,),
      handled: true,
      action: "workflow-progress",
      actionPayload: { workflowId: session.workflow.id, },
    };

    await saveSession(database, chatId, session,);
    return stepResult;
  }

  const match = matchWorkflowTrigger(effectiveContent, loadedWorkflows,) ??
    matchWorkflowIntent(effectiveContent, loadedWorkflows,);

  if (match === undefined) { return null; }

  const started = startSession(chatId, match,);
  await saveSession(database, chatId, started,);
  return {
    systemMessage: formatWorkflowPreview(started,),
    handled: true,
    action: "workflow-preview",
    actionPayload: { workflowId: match.id, steps: previewSteps(match,), },
  };
}

/**
 * Attempt to dispatch a slash command from the given content.
 *
 * Content is first split on top-level `|`: one segment takes the single
 * path, several take the pipe chain. Content that is not a command falls
 * through to the workflow router and finally to an unhandled result.
 * @param database - Kysely instance
 * @param config - Application config
 * @param actorId - Calling actor id
 * @param chatId - Target chat
 * @param content - Raw message content
 * @returns handled with the HTTP response, or handled:false when the content is not a command
 * @throws {Error} When the chat-context lookups fail
 */
export async function dispatchCommand(
  database: Kysely<DB>,
  config: Config,
  actorId: string,
  chatId: string,
  content: string,
): Promise<DispatchOutcome> {
  // Group-chat messages may address the bot first ("@Luna make a video").
  // Slash parsing, trigger matching, and step capture all run on the
  // remainder so addressed messages behave like bare ones.
  const effectiveContent = stripLeadingMention(content,);
  if (effectiveContent.length === 0) { return { handled: false, }; }

  // "picture of <character>" is a natural-language spelling of /avatar.
  // Prefix the captured identity so the existing command path binds the
  // generated image to the current chat character; everything else is untouched.
  const pictureMatch = CHARACTER_PICTURE_INTENT.exec(effectiveContent,);
  const dispatchContent = pictureMatch?.[1]
    ? `/avatar ${pictureMatch[1]}: ${effectiveContent.trim()}`
    : effectiveContent;

  if (splitPipeChain(dispatchContent,).length > 1) {
    return dispatchPipeChain(database, config, actorId, chatId, dispatchContent,);
  }

  const loadedWorkflows = Object.values(config.templates?.workflows?.workflows ?? {},);
  const rawParsed = parseCommand(dispatchContent,);
  if (rawParsed === null || getCommand(rawParsed.command,) === undefined) {
    const workflowResult = await runWorkflowFallback(database, chatId, dispatchContent, loadedWorkflows,);
    if (workflowResult === null) { return { handled: false, }; }

    auditCommandInvocation({ args: [], command: "workflow", result: workflowResult, userId: actorId, },);
    if (workflowResult.systemMessage) {
      await insertCommandSystemMessage(database, config, chatId, actorId, workflowResult.systemMessage,);
    }

    log().info("Command dispatched", { command: "workflow", handled: true, },);
    return commandResponse("workflow", workflowResult,);
  }

  const dispatch = await fetchDispatchContext(database, chatId, actorId,);
  const ctx = buildCommandContext({ chatId, database, config, dispatch, userId: actorId, },);
  const expanded = expandMacros(dispatchContent, commandMacroRegistry({ ctx, },),);
  const parsed = parseCommand(expanded,);
  const commandName = parsed?.command ?? "";
  const outcome = parsed !== null && getCommand(commandName,) !== undefined
    ? await runCommandStage({ database, parsed, ctx, },)
    : {
      status: "aborted" as const,
      reason: "invalid" as const,
      commandName: rawParsed.command,
      result: {
        handled: true,
        systemMessage: `**Command failed:** macro expansion of \`${dispatchContent}\` no longer resolves to a command.`,
      },
    };

  // A command that declines to handle keeps the legacy contract: the message
  // flows on to the LLM.
  if (outcome.status === "aborted" && outcome.reason === "unhandled") { return { handled: false, }; }
  const result: CommandResult = outcome.result;

  if (result.systemMessage) {
    // The handler already ran its side effects; a failed system-message insert
    // must not surface as an unhandled 500 that hides the completed command.
    try {
      await insertCommandSystemMessage(database, config, chatId, actorId, result.systemMessage,);
    } catch (error) {
      log().warn("command system message insert failed", {
        command: commandName,
        error: String(error,),
      },);
    }
  }

  log().info("Command dispatched", { command: commandName, handled: true, },);
  return commandResponse(commandName, result,);
}
