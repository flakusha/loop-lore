/**
 * /caption — Generate a caption for the last image in context,
 * or for a specified image message.
 *
 * Usage:
 *   /caption          — Caption the last image in context
 *   /caption <msgId>  — Caption a specific message's image
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("caption", (args,): CommandResult => {
  const target = args[0] || "last";

  // TODO: Fetch the specified message or last image from context
  // TODO: Call caption generation pipeline (src/generation/caption-route.ts)
  return {
    systemMessage: `**Caption generation queued for:** ${target}`,
    action: "caption-image",
    actionPayload: { target, },
    handled: true,
  };
},);
