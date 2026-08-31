// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/registry.ts
//
// Command registry — maps command names to handler functions.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/** Context provided to command handlers */
export interface CommandContext {
  chatId: string;
  /** Active chat summary — `worldId` is the chat's resolved world (not the chat type) */
  activeChat?: { id: string; mode?: string; type?: string; worldId?: string };
  currentCharacter?: { id: string; name: string; display_name?: string };
  messages?: { id: string; role: string; content: string; created_at: string }[];
  /** The calling participant's role in the chat (from `chat_participants`). */
  roleInChat?: ChatParticipantRole;
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

/** Registration options for a command. */
export interface CommandOptions {
  /**
   * Minimum participant role required to run the command.
   *
   * Hierarchy: `observer` < `member` < `owner`. Omitted = any participant
   * who can message may run it (the historical default).
   */
  requiredRole?: ChatParticipantRole;
}

interface CommandRegistration {
  handler: CommandHandler;
  requiredRole?: ChatParticipantRole;
}

const handlers = new Map<string, CommandRegistration>();

/**
 * Role privilege ordering: higher number = more privilege.
 * `guest` (party join/leave, C7) sits below observer — a guest has no
 * command privileges beyond messaging.
 */
const ROLE_PRIORITY: Record<ChatParticipantRole, number> = {
  guest: -1,
  observer: 0,
  member: 1,
  owner: 2,
};

/**
 * Check whether a participant's role satisfies a minimum required role.
 * @param actual - The participant's actual role in the chat
 * @param required - The minimum role required
 * @returns true when `actual` is at least as privileged as `required`
 */
export function satisfiesRole(actual: ChatParticipantRole, required: ChatParticipantRole,): boolean {
  return ROLE_PRIORITY[actual] >= ROLE_PRIORITY[required];
}

/**
 * Register a command handler.
 * @param name - Command name (lowercased automatically)
 * @param handler - Handler function
 * @param opts - Optional registration options (e.g. `requiredRole`)
 */
export function registerCommand(
  name: string,
  handler: CommandHandler,
  opts?: CommandOptions,
): void {
  handlers.set(name.toLowerCase(), { handler, requiredRole: opts?.requiredRole, },);
}

/**
 * Get a command handler by name.
 * @param name - Command name
 * @returns Handler function, or undefined if not registered
 */
export function getCommand(name: string,): CommandHandler | undefined {
  return handlers.get(name.toLowerCase(),)?.handler;
}

/**
 * Get the minimum role required to run a command, if any.
 * @param name - Command name
 * @returns Required role, or undefined when unrestricted
 */
export function getCommandRequirement(name: string,): ChatParticipantRole | undefined {
  return handlers.get(name.toLowerCase(),)?.requiredRole;
}

/**
 * List all registered command names.
 * @returns Array of command names
 */
export function listCommands(): string[] {
  return Array.from(handlers.keys(),);
}
