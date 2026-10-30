// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /avatar — Generate avatar art for the current chat character.
 *
 * Avatar Dogfood slice 1 (TASK-avatar-dogfood-assistant-generation): the
 * operator asks for character art in a chat with a character; the command
 * rides the EXISTING `/image` dispatch path — same `generate-image` frontend
 * action, same `POST /api/v1/generation/image` pipeline — and only adds the
 * `bindActorAvatar` field so the route binds the output as `generated`
 * avatar variants on the chat's character. No parallel pipeline.
 *
 * Availability gated on a configured image provider (same gate as /image).
 */

import { resolveImageCommandAvailability, } from "./image";
import { type CommandResult, registerCommand, } from "./registry";

const avatarCommandHandler = (args: string[], ctx: { currentCharacter?: { id: string } },): CommandResult => {
  const prompt = args.join(" ",).trim();
  const actorId = ctx.currentCharacter?.id;

  if (!prompt || !actorId) {
    return {
      systemMessage:
        "Usage: /avatar <prompt> — generate avatar art for the current character.\nRun it in a chat with a character.\nExample: /avatar Elara portrait, moonlit library, soft rim light",
      handled: true,
    };
  }

  // Same frontend action as /image — the payload only adds the binding target.
  return {
    action: "generate-image",
    actionPayload: { prompt, bindActorAvatar: actorId, },
    handled: true,
  };
};

registerCommand("avatar", avatarCommandHandler, { available: resolveImageCommandAvailability(), capabilities: ["write-asset", "network",], },);
