// src/assistant/command-parser.ts
//
// Parses slash commands from user input.
// Commands start with / and may have space-separated arguments.
//
// Example: "/roll 2d6+3 hello" → { command: "roll", args: ["2d6+3", "hello"], raw: "/roll 2d6+3 hello" }

import { getLogger, type Logger } from "../logger";

/** Lazy logger — only resolved when first used. */
const getLog = (): Logger => getLogger().child({ module: "command-parser" });

/** Parsed slash command result */
export interface ParsedCommand {
  /** Command name without the leading slash (e.g., "roll") */
  command: string;
  /** Space-separated arguments (e.g., ["2d6+3"] for "/roll 2d6+3") */
  args: string[];
  /** Original raw input string */
  raw: string;
}

/**
 * Parse a slash command from user input.
 *
 * Returns null if the input does not start with "/" or has no command name.
 *
 * @param input - User message text
 * @returns Parsed command or null
 *
 * @example
 * parseCommand("/roll 2d6+3")  → { command: "roll", args: ["2d6+3"], raw: "/roll 2d6+3" }
 * parseCommand("/help")        → { command: "help", args: [], raw: "/help" }
 * parseCommand("hello")        → null
 * parseCommand("/")            → null
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.length < 2) return null;

  // Split on first whitespace to separate command from args
  const spaceIdx = trimmed.indexOf(" ");
  const command = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const rawArgs = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
  const args = rawArgs.split(/\s+/).filter(Boolean);

  if (!command) return null;

  getLog().debug("Parsed command", { command, args });
  return { command, args, raw: trimmed };
}

/** All registered command names */
export const BUILTIN_COMMANDS = [
  "help",
  "roll",
  "dice",
  "clear",
  "stats",
  "improve",
  "summarize",
  "sum",
  "impersonate",
  "char",
  "narrate",
  "ooc",
  "debug",
  "detail",
  "context",
] as const;

/** Check if a command name is a built-in command */
export function isBuiltinCommand(command: string): boolean {
  return (BUILTIN_COMMANDS as readonly string[]).includes(command.toLowerCase());
}
