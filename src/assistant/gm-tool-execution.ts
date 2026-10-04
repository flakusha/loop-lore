// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Tool Execution
 *
 * Wires the AUX-LLM GM tool detector (`detectGmTool`) into the message-send
 * flow. When a message in a GM-mode chat was NOT handled as a slash command,
 * the detector runs on the message; a confident tool request executes the
 * matching registered command handler and posts its system message.
 *
 * Fail-open contract: every failure mode (GM gate off, AUX unconfigured,
 * timeout, parse failure, unknown tool, low confidence, handler throw)
 * degrades to `{ handled: false }` so the message flows on to normal
 * user-message creation. Slash-command input always wins — this path only
 * runs after `dispatchCommand` declined the message.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonResponse, } from "../routes/http-utils";
import { commandActiveChat, fetchChatAndRole, insertCommandSystemMessage, } from "../routes/messages/command";
import { jsonParseOr, toErrorMessage, } from "../utils";
import type { CommandContext, CommandResult, } from "./commands/registry";
import { getCommand, getCommandRequirement, satisfiesRole, } from "./commands/registry";
import { detectGmTool, GM_TOOL_NAMES, } from "./gm-tool-detection";
import type { GmToolDetection, GmToolName, } from "./gm-tool-detection";

/** Confidence threshold for executing a detected tool request. */
const CONFIDENCE_THRESHOLD = 0.7;

/** Mapping from detector tool names to registered command names. */
const TOOL_COMMANDS: Partial<Record<GmToolName, { command: string; prefixArgs?: string[] }>> = {
  roll_dice: { command: "roll", },
  check_stats: { command: "stats", },
  summarize: { command: "summarize", },
  generate_npc: { command: "create", prefixArgs: ["npc",], },
  generate_item: { command: "create", prefixArgs: ["item",], },
};

/** Options for {@link executeGmToolRequest}. */
export interface GmToolRequestOptions {
  database: Kysely<DB>;
  config: Config;
  actorId: string;
  chatId: string;
  content: string;
  /** Detector seam (DI/test); defaults to the AUX-LLM detector. */
  detect?: (content: string,) => Promise<GmToolDetection | null>;
}

/** Result of a GM tool execution attempt. */
export type GmToolOutcome = { handled: true; response: Response } | { handled: false };

/**
 * Convert detection params into positional command args: string and number
 * values are kept (in insertion order), everything else is dropped.
 * @param params - Detection params from the AUX model
 */
function paramsToArgs(params: Record<string, unknown>,): string[] {
  return Object.values(params,)
    .filter((v,): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String,)
    .filter((v,) => v.length > 0);
}

/**
 * Check whether a chat's `gm_config` selects the GM assistant role.
 * Exported domain predicate shared by tests and callers.
 * @param gmConfigJson - Raw `chats.gm_config` JSON string (nullable)
 */
export function isGmModeChat(gmConfigJson: string | null,): boolean {
  const gmConfig = jsonParseOr<{ assistantRole?: string }>(gmConfigJson ?? "", {},);
  return gmConfig.assistantRole === "gm";
}

/**
 * Attempt to execute a GM tool request expressed in natural language.
 * @param opts - Database, config, actor, chat, and message content
 * @returns `{ handled: true, response }` when a command executed, else `{ handled: false }`
 */
export async function executeGmToolRequest(opts: GmToolRequestOptions,): Promise<GmToolOutcome> {
  const { database, config, actorId, chatId, content, } = opts;
  const logger = getLogger().child({ module: "gm-tool-execution", },);
  const noop: GmToolOutcome = { handled: false, };

  // Single shared helper serves both the GM gate and the command context.
  const { chat: chatRecord, role: roleInChat, } = await fetchChatAndRole(database, chatId, actorId,);
  if (!chatRecord || !isGmModeChat(chatRecord.gm_config,)) { return noop; }

  let detection: GmToolDetection | null = null;
  try {
    detection = await (opts.detect ?? detectGmTool)(content, config, database, actorId, chatId,);
  } catch (error) {
    logger.debug("GM tool detection threw; skipping execution", {
      error: toErrorMessage(error,),
    },);
    return noop;
  }
  if (!detection || detection.name === "none" || detection.confidence < CONFIDENCE_THRESHOLD) {
    logger.debug("GM tool detection not actionable", {
      name: detection?.name ?? null,
      confidence: detection?.confidence ?? null,
    },);
    return noop;
  }
  const toolName: GmToolName = detection.name;
  const mapping = TOOL_COMMANDS[toolName];
  if (!mapping) {
    logger.debug("Detected GM tool has no registered command mapping", { name: toolName, },);
    return noop;
  }

  const handler = getCommand(mapping.command,);
  if (!handler) {
    logger.debug("GM tool command not registered", { command: mapping.command, },);
    return noop;
  }
  const requiredRole = getCommandRequirement(mapping.command,);
  if (requiredRole && !satisfiesRole(roleInChat, requiredRole,)) {
    logger.debug("GM tool request denied by role gate", { command: mapping.command, },);
    return noop;
  }

  const cmdCtx: CommandContext = {
    chatId,
    activeChat: commandActiveChat(chatRecord,),
    roleInChat,
    db: database,
    config,
    userId: actorId,
  };

  const args = [...(mapping.prefixArgs ?? []), ...paramsToArgs(detection.params,),];
  let result: CommandResult;
  try {
    result = await handler(args, cmdCtx,);
  } catch (error) {
    logger.debug("GM tool command handler threw", {
      command: mapping.command,
      error: toErrorMessage(error,),
    },);
    return noop;
  }
  if (!result.handled || !result.systemMessage) {
    logger.debug("GM tool command produced no system message; treating as no-op", {
      command: mapping.command,
    },);
    return noop;
  }

  await insertCommandSystemMessage(database, config, chatId, actorId, result.systemMessage,);
  logger.info("GM tool request executed", { tool: toolName, command: mapping.command, },);
  return {
    handled: true,
    response: jsonResponse({
      command: mapping.command,
      systemMessage: result.systemMessage,
      action: result.action ?? null,
      actionPayload: result.actionPayload ?? null,
    },),
  };
}

// Re-exported for consumers that only want the detector surface.
export { detectGmTool, GM_TOOL_NAMES, };
