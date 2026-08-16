// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/ooc.ts
//
// /ooc — send an out-of-character message.

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("ooc", (args,): CommandResult => {
  if (args.length === 0) {
    return {
      systemMessage: "Usage: /ooc <text> — send an out-of-character message.",
      handled: true,
    };
  }
  return {
    systemMessage: `**(OOC)** ${args.join(" ",)}`,
    action: "inject-ooc",
    handled: true,
  };
},);
