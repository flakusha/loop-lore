// src/assistant/commands/detail.ts
//
// /detail — set message detail level (immersion, basic, detailed).

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("detail", (args,): CommandResult => {
  const level = (args[0] || "").toLowerCase();
  const validLevels = ["immersion", "basic", "detailed",];
  if (!validLevels.includes(level,)) {
    return {
      systemMessage: "Usage: /detail <immersion|basic|detailed> — set message detail level.",
      handled: true,
    };
  }
  return {
    action: "set-detail-level",
    actionPayload: { level, },
    handled: true,
  };
},);
