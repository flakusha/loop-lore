// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /image — Generate an image from a text prompt.
 *
 * Returns a command action for the frontend to dispatch via
 * POST /api/generation/image. Does NOT execute generation synchronously
 * to avoid double execution (command handler + frontend action).
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("image", (args,): Promise<CommandResult> | CommandResult => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /image <prompt> — generate an image from text.\nExample: /image A medieval castle at sunset",
      handled: true,
    };
  }

  // Delegate to frontend action dispatch — avoids synchronous double execution
  return {
    action: "generate-image",
    actionPayload: { prompt, },
    handled: true,
  };
},);
