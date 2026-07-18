// src/assistant/commands/debug.ts
//
// /debug — toggle prompt debug view.

import { registerCommand, type CommandResult } from "./registry";

registerCommand("debug", async (): Promise<CommandResult> => {
  return {
    systemMessage: "Toggling prompt debug view...",
    action: "toggle-debug-view",
    handled: true,
  };
});
