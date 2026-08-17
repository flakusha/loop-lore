// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import "./image";
import "./quest";
import "./stats";
import "./video";
import "./sfx";
import "./music";
import "./caption";
import "./create";
import "./review";
import "./attack";
import "./battle";
import "./heal";

export { BUILTIN_COMMANDS, isBuiltinCommand, parseCommand, } from "../command-parser";
export type { ParsedCommand, } from "../command-parser";
export { formatDiceResult, handleRollCommand, parseDiceNotation, rollDice, rollDie, } from "./dice";
export type { DiceResult, DieRoll, } from "./dice";
export { getCommand, getCommandRequirement, listCommands, registerCommand, satisfiesRole, } from "./registry";
export type { CommandContext, CommandHandler, CommandOptions, CommandResult, } from "./registry";
