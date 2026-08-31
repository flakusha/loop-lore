// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { checkChatAccess, getChat, } from "../../chat/service";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils";
import { ChatIdParams, } from "../../validation/schemas";
import {
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Prompt-template routes — resolve the effective system prompt for a chat.
 *
 * `GET /api/v1/chats/:id/prompt-template` resolves the prompt from the primary
 * character's system prompt (or the registry default), determining its purpose
 * from chat mode + assistant role.
 * @param opts
 * @param prefix
 */
export function promptTemplateRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "chats-prompt-template", },)
    .get(
      `${prefix}/chats/:id/prompt-template`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const id = (ctx.params as { id: string }).id;

        const access = await checkChatAccess(database, id, userId, userRole,);
        if (!access.ok) { return notFound(access.error.message,); }

        const result = await getChat(database, id,);
        if (!result) { return notFound("Chat not found",); }

        const chat = result.chat;
        const mode = (chat.mode as string) ?? "story";
        const gmConfig = chat.gm_config
          ? jsonParseOr<Record<string, unknown>>(chat.gm_config as string, {},)
          : {};

        // Determine the prompt purpose from chat mode + assistant role
        const assistantRole = gmConfig.assistantRole as string | undefined;
        let purpose = "chat";
        if (mode === "story") {
          purpose = assistantRole === "gm" ? "gm" : "chat";
        }

        // Find the primary character's system prompt from participants
        const participants = result.participants;
        const characterParticipant = participants.find(
          (p: Record<string, unknown>,) => p.actor_type === "character" && p.role_in_chat !== "owner",
        );

        let characterPrompt: string | null = null;
        let characterName: string | null = null;
        if (characterParticipant) {
          const actorId = characterParticipant.actor_id as string;
          const actor = await database
            .selectFrom("actors",)
            .select(["system_prompt", "display_name",],)
            .where("id", "=", actorId,)
            .executeTakeFirst();
          if (actor) {
            characterPrompt = actor.system_prompt ?? null;
            characterName = actor.display_name ?? null;
          }
        }

        // Resolve: character prompt > config override > registry default
        const registryDefault = resolveSystemPrompt(config.templates?.llm, purpose,);
        const prompt = characterPrompt || registryDefault;
        const source = characterPrompt ? "character" : "registry";

        return jsonResponse({
          purpose,
          prompt,
          source,
          characterName,
          registryDefault,
          override: (chat as { prompt_override?: string | null }).prompt_override ?? null,
          usingOverride: Boolean((chat as { prompt_override?: string | null }).prompt_override,),
        },);
      },
      { params: ChatIdParams, },
    );
}
