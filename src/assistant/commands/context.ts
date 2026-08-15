// src/assistant/commands/context.ts
//
// /context — show current context window info.

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("context", (_args, ctx,): CommandResult => {
  const msgCount = ctx.messages?.length ?? 0;
  const chatName = ctx.activeChat?.id ?? "unknown";
  const charName = ctx.currentCharacter?.display_name || ctx.currentCharacter?.name || "none";

  const lines = [
    "**Context Info:**",
    `- Chat: \`${chatName}\``,
    `- Character: ${charName}`,
    `- Messages loaded: ${msgCount}`,
  ];

  return { systemMessage: lines.join("\n",), handled: true, };
},);
