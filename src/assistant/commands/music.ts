/**
 * /music — Generate music or link an external music source.
 *
 * If a URL is provided (YouTube, Spotify, SoundCloud), stores the link
 * and the browser handles playback natively (no server download).
 * If a text prompt is provided, generates audio via the audio provider.
 */

import { type CommandResult, registerCommand, } from "./registry";
import { EXTERNAL_MUSIC_PATTERNS, } from "../../regex/music-urls";

registerCommand("music", async (args,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage: "Usage: /music <prompt> — generate music or link external source.\n" +
        "External: /music https://youtube.com/watch?v=...\n" +
        "Generated: /music Epic battle theme with orchestral instruments",
      handled: true,
    };
  }

  // Check if the prompt is a URL to an external music service
  const isExternalUrl = EXTERNAL_MUSIC_PATTERNS.some((pattern,) => pattern.test(prompt,));

  if (isExternalUrl) {
    // Store link — browser handles playback natively (copyright-safe)
    return {
      systemMessage: `**Music linked:** ${prompt}\n\nThe browser will handle playback natively.`,
      action: "link-music",
      actionPayload: { url: prompt, source: "external", },
      handled: true,
    };
  }

  // Generate audio via audio provider
  // TODO: Call audio generation provider
  return {
    systemMessage: `**Music generation queued:** ${prompt}\n\nThe music will appear in the chat when ready.`,
    action: "generate-music",
    actionPayload: { prompt, },
    handled: true,
  };
},);
