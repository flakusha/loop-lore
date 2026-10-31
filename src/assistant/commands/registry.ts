// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/registry.ts
//
// Command registry — maps command names to handler functions.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { CapabilityTag, ToolLimits, } from "../capabilities";
import { DEFAULT_LIMITS, } from "../capabilities";

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
  /**
   * The caller's site role (`users.role`), resolved by `resolveUserRole` from
   * the same column the HTTP auth layer reads. Pass it to the shared world
   * access helpers (`requireWorldAccess`, `checkWorldOwnership`) instead of a
   * literal null, so an admin/owner caller takes the same privileged branch the
   * routes do. Absent or null means unresolved, which `can()` treats as no
   * permissions — fail closed.
   */
  userRole?: string | null;
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
  /**
   * Whether the command is fully implemented and should be advertised.
   *
   * Stub commands (e.g. `/sfx`, `/music`, `/video` before an audio/video
   * provider is configured) register with `available: false` so they are
   * hidden from `GET /api/commands` and the FE command palette while
   * remaining callable for direct input.
   */
  available?: boolean;
  /**
   * Capabilities the command needs. REQUIRED at registration time: an
   * untagged registration throws, so a command that declares none fails to
   * load (and fails the coverage test) rather than being silently denied at
   * runtime.
   *
   * Separate from `requiredRole`: the role gate answers "may this
   * participant run the command", the capabilities answer "what does the
   * command do".
   */
  capabilities?: CapabilityTag[];
  /** Per-command resource ceilings. Defaults to {@link DEFAULT_LIMITS}. */
  limits?: ToolLimits;
  /**
   * Hosts the command may reach over the network.
   *
   * The guard's effective network allowlist for one call is the union of
   * this declaration and the instance's configured provider hosts. The
   * effective allowlist FAILS CLOSED: when it is empty the command reaches
   * no host at all.
   */
  allowedNetworkHosts?: string[];
}

/**
 * A registered command: its handler plus the options it was registered with.
 * Extends {@link CommandOptions} so an option is declared in ONE place —
 * adding a field to the options cannot leave the stored registration behind.
 */
interface CommandRegistration extends CommandOptions {
  handler: CommandHandler;
  available: boolean;
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
  // `gm` is a moderation-tier role (added in migration 007), not a
  // command-gating tier. Membership-tier priority (member = 1) prevents
  // silent widening of owner-gated commands (attack/battle/create/debug/
  // heal) until a per-command decision opts in. Promote to 2 when a
  // command registers with `requiredRole: "gm"` to also permit owners.
  gm: 1,
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
 * @returns {void}
 * @throws {Error} when capabilities missing/empty
 */
export function registerCommand(
  name: string,
  handler: CommandHandler,
  opts?: CommandOptions,
): void {
  if (!opts?.capabilities || opts.capabilities.length === 0) {
    throw new Error(
      `registerCommand("${name}"): missing or empty capabilities — every command must declare at least one capability tag.`,
    );
  }

  handlers.set(name.toLowerCase(), {
    ...opts,
    handler,
    available: opts?.available ?? true,
  },);
}

/**
 * Remove a registration.
 *
 * TEST-ONLY. The registry is a process-global map: every test file in one bun
 * process shares it. A probe command that is registered and never removed shows
 * up in `listCommands()` for whichever file runs next, so the command-conformance
 * vectors (live registry vs the frozen list) pass or fail depending on file
 * order. A test that registers a probe must remove it in its teardown.
 * @param name - Command name to remove
 */
export function __unregisterCommandForTests(name: string,): void {
  handlers.delete(name.toLowerCase(),);
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
 * @returns Array of available command names (stub/unavailable commands excluded)
 */
export function listCommands(): string[] {
  return Array.from(handlers.entries(),)
    .filter(([, reg,],) => reg.available)
    .map(([name,],) => name);
}

/**
 * List every registered command name, stubs included.
 *
 * `listCommands` hides `available: false` stubs because the command palette
 * must not advertise them; a guard that checks declarations needs the full
 * roster, because a stub stays callable by direct slash input.
 * @returns Array of all registered command names
 */
export function listAllCommands(): string[] {
  return Array.from(handlers.keys(),);
}

/**
 * Get the declared capabilities of a command.
 * @param name - Command name
 * @returns Tags and limits, or undefined when the command is unknown or declares no capabilities
 */
export function getCommandCapabilities(name: string,): { tags: CapabilityTag[]; limits: ToolLimits } | undefined {
  const registration = handlers.get(name.toLowerCase(),);
  if (!registration?.capabilities || registration.capabilities.length === 0) { return undefined; }
  return { tags: registration.capabilities, limits: registration.limits ?? DEFAULT_LIMITS, };
}

/**
 * Get the limits of a command.
 *
 * A command that declares no limits inherits the shared conservative
 * default — the fail-closed rule applies to the capability declaration, not
 * to the limits, or every command would be denied.
 * @param name - Command name
 * @returns Limits, or undefined when the command is not registered
 */
export function getCommandLimits(name: string,): ToolLimits | undefined {
  const registration = handlers.get(name.toLowerCase(),);
  if (!registration) { return undefined; }
  return registration.limits ?? DEFAULT_LIMITS;
}

/**
 * Get the network hosts a command declares.
 *
 * The guard unions this with the instance's configured provider hosts to
 * build the effective allowlist for one call. A command that declares no
 * hosts is not thereby denied network access — the configured providers
 * still apply — but it adds nothing of its own.
 * @param name - Command name
 * @returns The declared hosts, or undefined when the command declares none
 */
export function getCommandNetworkHosts(name: string,): string[] | undefined {
  return handlers.get(name.toLowerCase(),)?.allowedNetworkHosts;
}
