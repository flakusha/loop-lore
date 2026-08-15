// src/assistant/commands/impersonate.ts
//
// /impersonate — SillyTavern-style impersonation with character selector.

import { type CommandResult, registerCommand, } from "./registry";

function buildImpersonateResult(args: string[], usageMsg: string,): CommandResult {
  if (args.length === 0) {
    return {
      systemMessage: usageMsg,
      action: "impersonate-toggle",
      actionPayload: { mode: "toggle", },
      handled: true,
    };
  }

  const target = args.join(" ",).toLowerCase();
  if (target === "off" || target === "stop") {
    return {
      systemMessage: "Stopped impersonating.",
      action: "impersonate-toggle",
      actionPayload: { mode: "off", },
      handled: true,
    };
  }

  return {
    systemMessage: `Impersonating as "${args.join(" ",)}"...`,
    action: "impersonate-select",
    actionPayload: { characterName: args.join(" ",), },
    handled: true,
  };
}

registerCommand("impersonate", (args,): CommandResult => {
  return buildImpersonateResult(
    args,
    "Usage: /impersonate <character_name> — play as a character. /impersonate off — stop impersonating.",
  );
},);

registerCommand("char", (args,): CommandResult => {
  return buildImpersonateResult(args, "Usage: /char <character_name> — alias for /impersonate. /char off — stop.",);
},);
