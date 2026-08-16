// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
