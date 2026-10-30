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
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonResponse, } from "../routes/http-utils";
import { commandActiveChat, fetchChatAndRole, insertCommandSystemMessage, } from "../routes/messages/command";
import { jsonParseOr, toErrorMessage, } from "../utils";
import type { CommandContext, CommandResult, } from "./commands/registry";
import { getCommand, getCommandRequirement, satisfiesRole, } from "./commands/registry";
import { detectGmTool, GM_TOOL_NAMES, } from "./gm-tool-detection";
import type { GmToolDetection, GmToolName, } from "./gm-tool-detection";
import { runGuardedToolCall, } from "./guard/pipeline";

/** Confidence threshold for executing a detected tool request. */
const CONFIDENCE_THRESHOLD = 0.7;

/** One detector tool → registered command mapping. */
interface ToolCommandMapping {
  /** Registered command name. */
  command: string;
  /** Args prepended ahead of every detected parameter (sub-command selector). */
  prefixArgs?: string[];
  /**
   * Parameter keys in the order the target command expects them as positional
   * args. The AUX model returns `params` as an unordered JSON object, so
   * reading `Object.values` order let a reordered model response silently
   * change the command that ran. Keys absent from this list are appended in
   * alphabetical order, keeping the argv deterministic.
   */
  paramOrder: string[];
}

/** Mapping from detector tool names to registered command names. */
const TOOL_COMMANDS: Partial<Record<GmToolName, ToolCommandMapping>> = {
  roll_dice: { command: "roll", paramOrder: ["dice", "modifier",], },
  check_stats: { command: "stats", paramOrder: ["target", "stat",], },
  summarize: { command: "summarize", paramOrder: [], },
  generate_npc: { command: "create", prefixArgs: ["npc",], paramOrder: ["name", "role", "setting", "description",], },
  generate_item: { command: "create", prefixArgs: ["item",], paramOrder: ["name", "type", "description",], },
};

/** Options for {@link executeGmToolRequest}. */
export interface GmToolRequestOptions {
  database: Kysely<DB>;
  /** App config — typed as the detector accepts it (single source of truth). */
  config: Parameters<typeof detectGmTool>[1];
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
 * values are kept, everything else is dropped.
 *
 * Argument order comes from the mapping's declared {@link ToolCommandMapping.paramOrder},
 * never from the JSON object's key order: undeclared keys trail the declared
 * ones alphabetically so the argv is reproducible.
 * @param params - Detection params from the AUX model
 * @param paramOrder - Declared parameter keys, in command-argument order
 * @returns Non-empty positional args
 */
function paramsToArgs(params: Record<string, unknown>, paramOrder: string[],): string[] {
  const readArg = (key: string,): string => {
    const value = params[key];
    return typeof value === "string" || typeof value === "number" ? String(value,) : "";
  };

  const declared = new Set(paramOrder,);
  const args = paramOrder.map(readArg,);
  for (const key of Object.keys(params,).filter((k,) => !declared.has(k,)).sort()) {
    args.push(readArg(key,),);
  }

  return args.filter((v,) => v.length > 0);
}

/**
 * Check whether a chat's `gm_config` selects the GM assistant role.
 * Exported domain predicate shared by tests and callers.
 * @param gmConfigJson - Raw `chats.gm_config` JSON string (nullable)
 * @returns true when the chat routes its assistant to the GM role
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
  const { chat: chatRecord, role: roleInChat, userRole, currentCharacter, } = await fetchChatAndRole(
    database,
    chatId,
    actorId,
  );

  if (!chatRecord || !isGmModeChat(chatRecord.gm_config,)) { return noop; }

  // The request runs in the caller's name: the AUX call resolves the BYO apiKey
  // by this id and `CommandContext.userId` carries it to the handlers. That is
  // only sound for a user principal — user actors are keyed by `users.id`
  // (`actors.id === users.id`), which is what makes `actorId` usable as the
  // user id. Any other actor type is not a principal, so fail closed rather
  // than resolve a key that belongs to someone else.
  const actingActor = await database
    .selectFrom("actors",)
    .select(["actor_type",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (actingActor?.actor_type !== "user") {
    logger.debug("GM tool request from a non-user actor; skipping", { actorId, },);
    return noop;
  }

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
    currentCharacter,
    db: database,
    config,
    userId: actorId,
    userRole,
  };

  const args = [...(mapping.prefixArgs ?? []), ...paramsToArgs(detection.params, mapping.paramOrder,),];
  let result: CommandResult;
  try {
    // The guard is the natural-language path's safety net: the capability
    // matrix, the aux-LLM judge for review-tier commands, and the sandbox.
    const outcome = await runGuardedToolCall({
      tool: mapping.command,
      args,
      ctx: cmdCtx,
      origin: "natural-language",
      content,
    }, database,);

    if (!outcome.allowed) {
      logger.warn("GM tool request denied by the capability guard", {
        command: mapping.command,
        reason: outcome.reason,
      },);

      return noop;
    }

    result = outcome.result ?? { handled: true, systemMessage: `\`/${mapping.command}\` produced no result.`, };
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
