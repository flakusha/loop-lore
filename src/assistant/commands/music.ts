// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /music — Generate music or link an external music source.
 *
 * If a URL is provided (YouTube, Spotify, SoundCloud), the frontend stores the
 * link through POST /api/v1/chats/:id/music-links (the chat's music-links
 * panel lists it) — no server download.
 * If a text prompt is provided, the frontend dispatches
 * POST /api/v1/generation/audio.
 */

import { EXTERNAL_MUSIC_PATTERNS, } from "../../regex/music-urls";
import { type CommandResult, registerCommand, } from "./registry";
import { resolveAudioCommandAvailability, } from "./sfx";

registerCommand("music", (args,): CommandResult => {
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
    // Store the link — the frontend posts it to the chat's music-links API.
    return {
      action: "link-music",
      actionPayload: { url: prompt, source: "external", },
      handled: true,
    };
  }

  // Delegate to frontend action dispatch — the route owns the generation.
  return {
    action: "generate-music",
    actionPayload: { prompt, seconds: 30, },
    handled: true,
  };
}, { available: resolveAudioCommandAvailability(), capabilities: ["write-asset", "network",], },);
