// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message AI utilities: summarize key points, extract action items,
 * or explain a message in simple terms.
 *
 * Runs through the shared AUX pipeline (auxiliary role, hard timeout,
 * zero temperature), so no model is configured → 503 instead of a
 * hang. The source message is loaded with the same access-checked
 * loader as forwarding; the result is returned, never stored.
 */
import { Elysia, t, } from "elysia";
import { callAux, } from "../../aux-pipeline/runner";
import { ErrorResponse, MessageAiActionBody, } from "../../validation/schemas";
import { Id, } from "../../validation/schemas/primitives";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HttpStatusCode, } from "../http-utils";
import { loadSourcePlaintext, } from "./source-message";
import type { HandlerOpts, } from "./types";

const AiActionParams = t.Object({
  id: Id,
  messageId: Id,
},);

/** One supported AI action on a single message. */
export type AiAction = typeof MessageAiActionBody.static["action"];

const MAX_SOURCE_CHARS = 4000;

const ACTION_PROMPTS: Record<AiAction, (text: string,) => string> = {
  summarize: (text,) => `Summarize the key points of this chat message in 3 bullets or fewer:\n\n${text}`,
  "action-items": (text,) =>
    `List the action items or concrete next steps from this chat message. Reply "None" if there are none:\n\n${text}`,
  explain: (text,) => `Explain this chat message in simple terms for a non-expert:\n\n${text}`,
};

/**
 * Build the auxiliary-model prompt for one action.
 * @param action
 * @param plaintext
 * @returns Prompt with the source capped to keep context small
 */
export function buildAiActionPrompt(action: AiAction, plaintext: string,): string {
  return ACTION_PROMPTS[action](plaintext.slice(0, MAX_SOURCE_CHARS,),);
}

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin serving the AI-action endpoint
 */
export function aiActionRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-ai-action", },)
    .post(
      `${prefix}/chats/:id/messages/:messageId/ai-action`,
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: chatId, messageId, } = ctx.params as { id: string; messageId: string };
        const body = ctx.body as typeof MessageAiActionBody.static;

        const loaded = await loadSourcePlaintext(database, {
          chatId,
          messageId,
          actorId,
          userRole: ctx.userRole as string | null,
        },);
        if (!loaded.ok) { return loaded.response; }

        const result = await callAux(
          "message-action",
          config,
          database,
          [{ role: "user", content: buildAiActionPrompt(body.action, loaded.plaintext,), },],
          { userId: actorId, chatId, maxTokens: 300, },
        );
        if (!result) {
          return jsonResponse(
            { error: "ai_unavailable", message: "AI actions are unavailable (no auxiliary model configured).", },
            503 as HttpStatusCode,
          );
        }
        return jsonResponse({ action: body.action, result: result.content, },);
      },
      {
        params: AiActionParams,
        body: MessageAiActionBody,
        response: {
          200: t.Object({ action: t.String(), result: t.String(), },),
          401: ErrorResponse,
          404: ErrorResponse,
          422: ErrorResponse,
          503: ErrorResponse,
        },
      },
    );
}
