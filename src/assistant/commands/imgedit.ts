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

import {
  createHonkboxEditProvider,
  honkboxProbeForImgEdit,
  shouldUseHonkbox,
} from "../../image-edit/provider-selection";
import { ensureWorkflowFileTemplates, } from "../../image-edit/providers/comfyui-workflow-template";
import {
  registerBuiltinTemplates,
  templateRegistry,
} from "../../image-edit/template-registry";
import type { ImageEditProvider, WorkflowTemplate, } from "../../image-edit/types";
import type { HonkboxProbeResult, } from "../../integrations/honkbox";
import {
  type CommandContext,
  type CommandResult,
  registerCommand,
} from "./registry";

const USAGE =
  "Usage: /imgedit <template> [prompt] — edit the latest image in chat with an image-edit template.\nExample: /imgedit img2img make the sky dramatic";

/** Run one honkbox edit when the gate allows it; undefined keeps ComfyUI. */
async function maybeRunHonkboxEdit(opts: {
  readonly template: WorkflowTemplate;
  readonly params: Record<string, unknown>;
  readonly ownerId: string;
  readonly chatId: string;
  readonly messageId?: string;
  readonly deps: ImgEditCommandDeps;
},): Promise<CommandResult | undefined> {
  const { template, params, ownerId, chatId, messageId, deps, } = opts;
  const probe = deps.probe ? await deps.probe() : await honkboxProbeForImgEdit();
  if (!shouldUseHonkbox(probe, template,)) { return undefined; }

  const provider = deps.honkbox ? deps.honkbox(probe,) : createHonkboxEditProvider(probe,);
  const results = await provider.execute(
    {
      template_id: template.id,
      backend: "honkbox",
      params,
      chatId,
      ...(messageId ? { messageId, } : {}),
    },
    template,
    { ownerId, },
  );

  return {
    systemMessage: `Image edit with "${template.name}" finished via honkbox (${String(results.length,)} image${
      results.length === 1 ? "" : "s"
    }).`,
    handled: true,
  };
}

/** Optional seams for command-layer provider selection tests. */
export interface ImgEditCommandDeps {
  /** Cached/fresh honkbox probe; omit for the env-driven production probe. */
  readonly probe?: () => Promise<HonkboxProbeResult | undefined>;
  /** Provider factory; omit for the real honkbox adapter. */
  readonly honkbox?: (probe: HonkboxProbeResult | undefined,) => ImageEditProvider;
}

export async function imgeditCommandHandler(
  args: string[],
  ctx: CommandContext,
  deps: ImgEditCommandDeps = {},
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

  // Capability-gated honkbox path: a disabled/absent gate leaves the action
  // below — and the HTTP route it feeds — byte-for-byte unchanged.
  if (ctx.userId) {
    const honkboxResult = await maybeRunHonkboxEdit({
      template,
      params,
      ownerId: ctx.userId,
      chatId: ctx.chatId,
      messageId,
      deps,
    },);

    if (honkboxResult) { return honkboxResult; }
  }

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
  requiredRole: "member",
  capabilities: ["read-chat", "write-asset", "network",],
},);
