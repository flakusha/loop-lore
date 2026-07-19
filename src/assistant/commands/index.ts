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

export { BUILTIN_COMMANDS, isBuiltinCommand, parseCommand } from "../command-parser";
export type { ParsedCommand } from "../command-parser";
export { formatDiceResult, handleRollCommand, parseDiceNotation, rollDice, rollDie } from "./dice";
export type { DiceResult, DieRoll } from "./dice";
export { getCommand, listCommands, registerCommand } from "./registry";
export type { CommandContext, CommandHandler, CommandResult } from "./registry";
