// src/assistant/commands/context.ts
//
// /context — show current context window info.

import { registerCommand, type CommandResult } from "./registry";

registerCommand("context", async (_args, ctx): Promise<CommandResult> => {
  const msgCount = ctx.messages?.length ?? 0;
  const chatName = ctx.activeChat?.id ?? "unknown";
  const charName = ctx.currentCharacter?.display_name || ctx.currentCharacter?.name || "none";

  const lines = [
    "**Context Info:**",
    `- Chat: \`${chatName}\``,
    `- Character: ${charName}`,
    `- Messages loaded: ${msgCount}`,
  ];

  return { systemMessage: lines.join("\n"), handled: true };
});
