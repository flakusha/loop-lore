// src/assistant/commands/impersonate.ts
//
// /impersonate — SillyTavern-style impersonation with character selector.

import { registerCommand, type CommandResult } from "./registry";

registerCommand("impersonate", async (args): Promise<CommandResult> => {
  if (args.length === 0) {
    return {
      systemMessage:
        "Usage: /impersonate <character_name> — play as a character. /impersonate off — stop impersonating.",
      action: "impersonate-toggle",
      actionPayload: { mode: "toggle" },
      handled: true,
    };
  }

  const target = args.join(" ").toLowerCase();
  if (target === "off" || target === "stop") {
    return {
      systemMessage: "Stopped impersonating.",
      action: "impersonate-toggle",
      actionPayload: { mode: "off" },
      handled: true,
    };
  }

  return {
    systemMessage: `Impersonating as "${args.join(" ")}"...`,
    action: "impersonate-select",
    actionPayload: { characterName: args.join(" ") },
    handled: true,
  };
});

registerCommand("char", async (args): Promise<CommandResult> => {
  if (args.length === 0) {
    return {
      systemMessage: "Usage: /char <character_name> — alias for /impersonate. /char off — stop.",
      action: "impersonate-toggle",
      actionPayload: { mode: "toggle" },
      handled: true,
    };
  }

  const target = args.join(" ").toLowerCase();
  if (target === "off" || target === "stop") {
    return {
      systemMessage: "Stopped impersonating.",
      action: "impersonate-toggle",
      actionPayload: { mode: "off" },
      handled: true,
    };
  }

  return {
    systemMessage: `Impersonating as "${args.join(" ")}"...`,
    action: "impersonate-select",
    actionPayload: { characterName: args.join(" ") },
    handled: true,
  };
});
