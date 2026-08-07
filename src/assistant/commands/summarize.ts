// src/assistant/commands/summarize.ts
//
// /summarize — extractive summary of recent messages.

import { type CommandResult, registerCommand, } from "./registry";

function buildSummary(args: string[], ctx: { messages?: { role: string; content: string }[] },): CommandResult {
  if (!ctx.messages || ctx.messages.length === 0) {
    return { systemMessage: "No messages to summarize.", handled: true, };
  }

  const count = Math.min(parseInt(args[0] || "10", 10,) || 10, ctx.messages.length,);
  const recent = ctx.messages.slice(-count,);
  const userMsgs: typeof recent = [];
  const aiMsgs: typeof recent = [];
  for (const m of recent) {
    if (m.role === "user") { userMsgs.push(m,); }
    else if (m.role === "assistant" || m.role === "character") { aiMsgs.push(m,); }
  }

  const lines = [
    `**Conversation Summary** (last ${count} messages):`,
    "",
    `**User messages:** ${userMsgs.length}`,
    ...Array.from(userMsgs, (m,) => `- ${m.content.slice(0, 100,)}...`,),
    "",
    `**AI responses:** ${aiMsgs.length}`,
    ...Array.from(aiMsgs, (m,) => `- ${m.content.slice(0, 100,)}...`,),
  ];

  return { systemMessage: lines.join("\n",), handled: true, };
}

registerCommand("summarize", async (args, ctx,): Promise<CommandResult> => {
  return buildSummary(args, ctx,);
},);

registerCommand("sum", async (args, ctx,): Promise<CommandResult> => {
  return buildSummary(args, ctx,);
},);
