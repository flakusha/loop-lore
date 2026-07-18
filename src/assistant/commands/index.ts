// src/assistant/commands/index.ts
//
// Command system barrel — registers all commands and re-exports registry.

import "./summarize";
import "./impersonate";
import "./narrate";
import "./ooc";
import "./debug";
import "./detail";
import "./context";
import "./dice";
import "./help";
import "./improve";

export { parseCommand, isBuiltinCommand, BUILTIN_COMMANDS } from "../command-parser";
export type { ParsedCommand } from "../command-parser";
export { registerCommand, getCommand, listCommands } from "./registry";
export type { CommandContext, CommandResult, CommandHandler } from "./registry";
export { rollDice, rollDie, parseDiceNotation, formatDiceResult, handleRollCommand } from "./dice";
export type { DiceResult, DieRoll } from "./dice";
