// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// src/assistant/commands/index.ts
//
// Command system barrel — registers all commands and re-exports registry.
import "./agency";
import "./analyze";
import "./attack";
import "./battle";
import "./caption";
import "./context";
import "./create";
import "./debug";
import "./detail";
import "./dice";
import "./gm-guidance";
import "./harness-verbs";
import "./heal";
import "./help";
import "./image";
import "./impersonate";
import "./improve";
import "./interaction";
import "./link";
import "./music";
import "./narrate";
import "./ooc";
import "./quest";
import "./regen";
import "./review";
import "./rewrite";
import "./sfx";
import "./stats";
import "./summarize";
import "./translate";
import "./video";
import "./workflow";

export { parseCommand, } from "../command-parser";
export type { ParsedCommand, } from "../command-parser";
export { formatDiceResult, handleRollCommand, parseDiceNotation, rollDice, rollDie, } from "./dice";
export type { DiceResult, DieRoll, } from "./dice";
export { getCommand, getCommandRequirement, listCommands, registerCommand, satisfiesRole, } from "./registry";
export type { CommandContext, CommandHandler, CommandOptions, CommandResult, } from "./registry";
