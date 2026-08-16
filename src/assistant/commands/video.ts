// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /video — Generate a video from a text prompt.
 *
 * Uses video generation providers (ComfyUI, Runway, etc.) when configured.
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("video", (args,): CommandResult => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /video <prompt> — generate a video from text.\nExample: /video A dragon flying over mountains",
      handled: true,
    };
  }

  // TODO: Call video generation provider (ComfyUI, Runway, etc.)
  return {
    systemMessage: `**Video generation queued:** ${prompt}\n\nThe video will appear in the chat when ready.`,
    action: "generate-video",
    actionPayload: { prompt, },
    handled: true,
  };
},);
