// src/assistant/commands/debug.ts
//
// /debug — toggle prompt debug view.

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("debug", async (): Promise<CommandResult> => {
  return {
    systemMessage: "Toggling prompt debug view...",
    action: "toggle-debug-view",
    handled: true,
  };
},);
