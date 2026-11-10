// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /sfx — Generate a sound effect from a text prompt.
 * /sound — Alias for /sfx
 *
 * Returns a command action for the frontend to dispatch via
 * POST /api/v1/generation/audio. Does NOT execute generation synchronously
 * to avoid double execution (command handler + frontend action).
 *
 * Availability gated on a configured audio provider (mirrors /image and
 * /video): with none configured the command stays hidden from `listCommands()`
 * while the handler stays callable for direct slash input.
 */

import { loadConfig, } from "../../config/load";
import { type CommandResult, registerCommand, } from "./registry";

/** True when at least one audio provider is configured (shared with /music). */
export function resolveAudioCommandAvailability(): boolean {
  try {
    return (loadConfig().generation.providers.audio?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Handler for sound effect generation
 * @param args
 * @returns string
 */
function handleSfx(args: string[],): CommandResult {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage: "Usage: /sfx <prompt> — generate a sound effect.\nExample: /sfx Thunder crashing in the distance",
      handled: true,
    };
  }

  // Delegate to frontend action dispatch — the route owns the generation.
  return {
    action: "generate-sfx",
    actionPayload: { prompt, seconds: 6, },
    handled: true,
  };
}

registerCommand("sfx", handleSfx, {
  available: resolveAudioCommandAvailability(),
  capabilities: ["write-asset", "network",],
},);

// Alias: /sound → /sfx
registerCommand("sound", handleSfx, {
  available: resolveAudioCommandAvailability(),
  capabilities: ["write-asset", "network",],
},);
