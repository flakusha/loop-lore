/**
 * /caption — Generate a caption for the last image in context,
 * or for a specified image message.
 *
 * Usage:
 *   /caption          — Caption the last image in context
 *   /caption <msgId>  — Caption a specific message's image
 */

import { getDatabase, } from "../../db/index";
import { handleImageCaption, } from "../../generation/caption-route";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("caption", async (args, ctx,): Promise<CommandResult> => {
  const target = args[0] || "last";
  const db = getDatabase();

  let messageId: string | undefined;

  if (target === "last") {
    // Find the most recent message with an attached image
    const recentMsgs = ctx.messages ?? [];
    for (const msg of [...recentMsgs,].reverse()) {
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
        break;
      }
    }
  } else {
    // Treat as message ID
    messageId = target;
  }

  if (!messageId) {
    return {
      systemMessage: "No image found to caption. Send an image first, then use /caption.",
      handled: true,
    };
  }

  // Get asset IDs for this message
  const linkedAssets = await db
    .selectFrom("asset_links",)
    .innerJoin("assets", "assets.id", "asset_links.asset_id",)
    .where("asset_links.entity_type", "=", "message",)
    .where("asset_links.entity_id", "=", messageId,)
    .where("assets.mime_type", "like", "image/%",)
    .select(["assets.id",],)
    .execute();

  if (linkedAssets.length === 0) {
    return {
      systemMessage: `No image assets found for message ${messageId}.`,
      handled: true,
    };
  }

  const assetIds = linkedAssets.map((a,) => a.id);

  try {
    const response = await handleImageCaption({
      assetIds,
      chatId: ctx.chatId,
      messageId,
    },);

    const data = await response.json() as {
      data?: { assetId: string; caption: string }[];
      error?: string;
    };

    if (!response.ok || data.error) {
      return {
        systemMessage: `**Caption generation failed:** ${data.error ?? "Unknown error"}`,
        handled: true,
      };
    }

    const captions = data.data ?? [];
    if (captions.length === 0) {
      return {
        systemMessage: "**Caption generation failed:** No captions returned.",
        handled: true,
      };
    }

    const captionList = captions
      .filter((c,) => c.caption)
      .map((c,) => `**${c.assetId.slice(0, 8,)}:** ${c.caption}`)
      .join("\n\n",);

    return {
      systemMessage: captionList
        ? `**Image captions:**\n\n${captionList}`
        : "No captions could be generated for the image.",
      action: "caption-image",
      actionPayload: { messageId, assetIds, captions, },
      handled: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      systemMessage: `**Caption generation failed:** ${msg}`,
      handled: true,
    };
  }
},);
