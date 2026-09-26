// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /image — Generate an image from a text prompt.
 *
 * Returns a command action for the frontend to dispatch via
 * POST /api/v1/generation/image. Does NOT execute generation synchronously
 * to avoid double execution (command handler + frontend action).
 *
 * Availability gated on configured image provider (mirrors sfx/music/video
 * pattern from BUG-advertised-sfx-music-video-commands-are-stubs). When no
 * provider is configured the command is hidden from `listCommands()` but
 * the handler stays callable for legacy slash-input fallback paths.
 */

import { loadConfig, } from "../../config/load";
import { type CommandResult, registerCommand, } from "./registry";

function resolveImageCommandAvailability(): boolean {
  try {
    return (loadConfig().generation.providers.sd?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

const imageCommandHandler = (args: string[],): Promise<CommandResult> | CommandResult => {
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
};

registerCommand("image", imageCommandHandler, { available: resolveImageCommandAvailability(), },);
