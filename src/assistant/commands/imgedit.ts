// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /imgedit <template> [prompt] — run an image-edit workflow from chat.
 *
 * The template is resolved through the image-edit service layer (registry),
 * not the HTTP route. No job starts here: the returned action lets
 * chat-actions post to the existing /api/v1/image-edit/run route, which owns
 * auth, BYOK and execution. An unknown template or a missing input image
 * therefore leaves no partial work behind.
 */

import { ensureWorkflowFileTemplates, } from "../../image-edit/providers/comfyui-workflow-template";
import {
  registerBuiltinTemplates,
  templateRegistry,
} from "../../image-edit/template-registry";
import {
  type CommandContext,
  type CommandResult,
  registerCommand,
} from "./registry";

const USAGE =
  "Usage: /imgedit <template> [prompt] — edit the latest image in chat with an image-edit template.\nExample: /imgedit img2img make the sky dramatic";

export async function imgeditCommandHandler(
  args: string[],
  ctx: CommandContext,
): Promise<CommandResult> {
  const templateId = (args[0] ?? "").trim();
  const prompt = args.slice(1,).join(" ",).trim();
  if (!templateId) { return { systemMessage: USAGE, handled: true, }; }

  // Same built-in + operator-config sources the HTTP route hydrates. The
  // DB-backed library is hydrated once by the route mount at startup.
  registerBuiltinTemplates();
  await ensureWorkflowFileTemplates();
  const template = templateRegistry.get(templateId,);
  if (!template) {
    return {
      systemMessage:
        `Unknown image-edit template "${templateId}". Use a template id from the image-edit template list.`,
      handled: true,
    };
  }

  const imageParam = template.parameters.find((p,) => p.type === "image");
  let messageId: string | undefined;
  let inputImage: string | undefined;
  if (imageParam) {
    const db = ctx.db;
    if (!db) {
      return { systemMessage: "**Image edit unavailable:** command context missing database.", handled: true, };
    }

    // The most recent chat message with an attached image, mirroring /caption.
    for (const msg of [...(ctx.messages ?? []),].reverse()) {
      const assets = await db
        .selectFrom("asset_links",)
        .innerJoin("assets", "assets.id", "asset_links.asset_id",)
        .where("asset_links.entity_type", "=", "message",)
        .where("asset_links.entity_id", "=", msg.id,)
        .where("assets.mime_type", "like", "image/%",)
        .select(["assets.id",],)
        .limit(1,)
        .execute();

      if (assets.length > 0) {
        messageId = msg.id;
        inputImage = assets[0]!.id;
        break;
      }
    }

    if (!inputImage) {
      return {
        systemMessage: "No input image found. Send or attach an image in this chat, then run /imgedit again.",
        handled: true,
      };
    }
  }

  const params: Record<string, unknown> = { prompt, };
  if (imageParam && inputImage) { params[imageParam.name] = inputImage; }
  const backend = template.backends.includes("comfyui",) ? "comfyui" : template.backends[0]!;

  return {
    // Inserted as a chat system message by dispatchCommand, so the run is
    // visible in both single and group chats; the action starts it in the UI.
    systemMessage: `Starting image edit with template "${template.name}".`,
    action: "imgedit",
    actionPayload: {
      template_id: template.id,
      backend,
      params,
      chatId: ctx.chatId,
      ...(messageId ? { messageId, } : {}),
    },
    handled: true,
  };
}

registerCommand("imgedit", imgeditCommandHandler, {
  capabilities: ["read-chat", "write-asset", "network",],
},);
