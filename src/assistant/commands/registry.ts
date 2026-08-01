// src/assistant/commands/registry.ts
//
// Command registry — maps command names to handler functions.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** Context provided to command handlers */
export interface CommandContext {
  chatId: string;
  /** Active chat summary — `worldId` is the chat's resolved world (not the chat type) */
  activeChat?: { id: string; mode?: string; type?: string; worldId?: string };
  currentCharacter?: { id: string; name: string; display_name?: string };
  messages?: { id: string; role: string; content: string; created_at: string }[];
  db?: Kysely<DB>;
  config?: Config;
  userId?: string;
}

/** Result returned by a command handler */
export interface CommandResult {
  /** Message to display as system message in chat */
  systemMessage?: string;
  /** Action to trigger on the frontend */
  action?: string;
  actionPayload?: Record<string, unknown>;
  /** Whether to prevent sending the message to the LLM */
  handled: boolean;
}

/** Command handler function signature */
export type CommandHandler = (args: string[], ctx: CommandContext,) => CommandResult | Promise<CommandResult>;

const handlers = new Map<string, CommandHandler>();

/**
 * Register a command handler.
 *
 * @param name - Command name (lowercased automatically)
 * @param handler - Handler function
 */
export function registerCommand(name: string, handler: CommandHandler,): void {
  handlers.set(name.toLowerCase(), handler,);
}

/**
 * Get a command handler by name.
 *
 * @param name - Command name
 * @returns Handler function, or undefined if not registered
 */
export function getCommand(name: string,): CommandHandler | undefined {
  return handlers.get(name.toLowerCase(),);
}

/**
 * List all registered command names.
 *
 * @returns Array of command names
 */
export function listCommands(): string[] {
  return Array.from(handlers.keys(),);
}
