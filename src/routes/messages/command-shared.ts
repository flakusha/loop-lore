// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Types and builders shared by the slash-command dispatch modules. */

import type { Kysely, } from "kysely";
import type { CommandContext, CommandResult, } from "../../assistant/commands/registry";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { jsonResponse, } from "../http-utils";
import { commandActiveChat, type DispatchContext, } from "./command-context";

/** The dispatcher's outcome. */
export type DispatchOutcome = { handled: true; response: Response } | { handled: false };

/** Shape the frontend consumes for a handled command. */
export function commandResponse(command: string, result: CommandResult,): DispatchOutcome {
  return {
    handled: true,
    response: jsonResponse({
      command,
      systemMessage: result.systemMessage ?? null,
      action: result.action ?? null,
      actionPayload: result.actionPayload ?? null,
    },),
  };
}

/** Inputs for building a dispatch {@link CommandContext}. */
export interface BuildContextInput {
  chatId: string;
  database: Kysely<DB>;
  config: Config;
  dispatch: DispatchContext;
  userId: string;
}

/**
 * Build the dispatch {@link CommandContext} from a fetched chat context.
 * @param input - Chat id, db/config, fetched dispatch context, calling user
 * @returns the command context (no named args yet — stages attach those)
 */
export function buildCommandContext(input: BuildContextInput,): CommandContext {
  const { chatId, database, config, dispatch, userId, } = input;
  return {
    chatId,
    activeChat: commandActiveChat(dispatch.chat,),
    messages: dispatch.messages,
    roleInChat: dispatch.role,
    db: database,
    config,
    userId,
    userRole: dispatch.userRole,
    currentCharacter: dispatch.currentCharacter,
  };
}
