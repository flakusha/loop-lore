/**
 * /image — Generate an image from a text prompt.
 *
 * Uses the Stable Diffusion adapter (src/assistant/sd.ts) when configured.
 * Falls back to a placeholder message if no SD provider is available.
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("image", (args,): CommandResult => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /image <prompt> — generate an image from text.\nExample: /image A medieval castle at sunset",
      handled: true,
    };
  }

  // TODO: Call Stable Diffusion adapter (src/assistant/sd.ts)
  // TODO: Return image asset link in response
  return {
    systemMessage: `**Image generation queued:** ${prompt}\n\nThe image will appear in the chat when ready.`,
    action: "generate-image",
    actionPayload: { prompt, },
    handled: true,
  };
},);
