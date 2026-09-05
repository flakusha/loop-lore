// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /sfx — Generate a sound effect from a text prompt.
 * /sound — Alias for /sfx
 */

import { type CommandResult, registerCommand, } from "./registry";

/**
 * Handler for sound effect generation
 * @param args
 */
function handleSfx(args: string[],): CommandResult {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage: "Usage: /sfx <prompt> — generate a sound effect.\nExample: /sfx Thunder crashing in the distance",
      handled: true,
    };
  }

  // TODO: Call audio generation provider
  return {
    systemMessage: `**Sound effect queued:** ${prompt}`,
    action: "generate-sfx",
    actionPayload: { prompt, },
    handled: true,
  };
}

registerCommand("sfx", (args,): CommandResult => {
  return handleSfx(args,);
}, { available: false, },);

// Alias: /sound → /sfx
registerCommand("sound", (args,): CommandResult => {
  return handleSfx(args,);
}, { available: false, },);
