// src/assistant/commands/debug.ts
//
// /debug — toggle prompt debug view.

import { ChatParticipantRole, } from "../../db/enums";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("debug", (): CommandResult => {
  return {
    systemMessage: "Toggling prompt debug view...",
    action: "toggle-debug-view",
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Owner, },);
