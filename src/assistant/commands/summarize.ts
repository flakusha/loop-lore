// src/assistant/commands/summarize.ts
//
// /summarize — extractive summary of recent messages.

import { registerCommand, type CommandResult } from "./registry";

registerCommand("summarize", async (args, ctx): Promise<CommandResult> => {
  if (!ctx.messages || ctx.messages.length === 0) {
    return { systemMessage: "No messages to summarize.", handled: true };
  }

  const count = Math.min(parseInt(args[0] || "10", 10) || 10, ctx.messages.length);
  const recent = ctx.messages.slice(-count);
  const userMsgs = recent.filter((m) => m.role === "user");
  const aiMsgs = recent.filter((m) => m.role === "assistant" || m.role === "character");

  const lines = [
    `**Conversation Summary** (last ${count} messages):`,
    "",
    `**User messages:** ${userMsgs.length}`,
    ...userMsgs.map((m) => `- ${m.content.slice(0, 100)}...`),
    "",
    `**AI responses:** ${aiMsgs.length}`,
    ...aiMsgs.map((m) => `- ${m.content.slice(0, 100)}...`),
  ];

  return { systemMessage: lines.join("\n"), handled: true };
});

registerCommand("sum", async (args, ctx): Promise<CommandResult> => {
  const count = parseInt(args[0] || "10", 10) || 10;
  if (!ctx.messages || ctx.messages.length === 0) {
    return { systemMessage: "No messages to summarize.", handled: true };
  }

  const recent = ctx.messages.slice(-count);
  const userMsgs = recent.filter((m) => m.role === "user");
  const aiMsgs = recent.filter((m) => m.role === "assistant" || m.role === "character");

  const lines = [
    `**Conversation Summary** (last ${count} messages):`,
    "",
    `**User messages:** ${userMsgs.length}`,
    ...userMsgs.map((m) => `- ${m.content.slice(0, 100)}...`),
    "",
    `**AI responses:** ${aiMsgs.length}`,
    ...aiMsgs.map((m) => `- ${m.content.slice(0, 100)}...`),
  ];

  return { systemMessage: lines.join("\n"), handled: true };
});
