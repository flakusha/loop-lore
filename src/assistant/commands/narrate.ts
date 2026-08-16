// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/narrate.ts
//
// /narrate — inject a narration as system message.

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("narrate", (args,): CommandResult => {
  if (args.length === 0) {
    return {
      systemMessage: "Usage: /narrate <text> — inject a narration as system message.",
      handled: true,
    };
  }
  return {
    systemMessage: args.join(" ",),
    action: "inject-narration",
    handled: true,
  };
},);
