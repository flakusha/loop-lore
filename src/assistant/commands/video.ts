// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /video — Generate a video from a text prompt.
 *
 * Returns a command action for the frontend to dispatch via
 * POST /api/v1/generation/video (mirrors /image). The route renders the clip
 * in the background and persists it as a chat-linked video asset.
 *
 * Availability gated on a configured video provider: with none configured the
 * command stays hidden from `listCommands()` while the handler remains callable
 * for direct slash input.
 */

import { loadConfig, } from "../../config/load";
import { type CommandResult, registerCommand, } from "./registry";

/** True when at least one video provider is configured. */
export function resolveVideoCommandAvailability(): boolean {
  try {
    return (loadConfig().generation.providers.video?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

registerCommand("video", (args,): CommandResult => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /video <prompt> — generate a video from text.\nExample: /video A dragon flying over mountains",
      handled: true,
    };
  }

  // Delegate to the frontend action dispatch — the route owns the render.
  return {
    action: "generate-video",
    actionPayload: { prompt, },
    handled: true,
  };
}, { available: resolveVideoCommandAvailability(), capabilities: ["write-asset", "network",], },);
