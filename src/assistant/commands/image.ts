/**
 * /image — Generate an image from a text prompt.
 *
 * Uses the image generation pipeline (src/generation/image-gen-route.ts).
 * Supports ComfyUI, OpenAI-compatible, and sdapi backends.
 */

import { handleImageGeneration, } from "../../generation/image-gen-route";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("image", async (args, ctx,): Promise<CommandResult> => {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /image <prompt> — generate an image from text.\nExample: /image A medieval castle at sunset",
      handled: true,
    };
  }

  try {
    const response = await handleImageGeneration({
      prompt,
      chatId: ctx.chatId,
    },);

    const data = await response.json() as {
      data?: { id: string; url: string; filename: string }[];
      error?: string;
    };

    if (!response.ok || data.error) {
      return {
        systemMessage: `**Image generation failed:** ${data.error ?? "Unknown error"}`,
        handled: true,
      };
    }

    const assets = data.data ?? [];
    if (assets.length === 0) {
      return {
        systemMessage: "**Image generation failed:** No images returned.",
        handled: true,
      };
    }

    const imageList = assets
      .map((a,) => `![${a.filename}](${a.url})`)
      .join("\n",);

    return {
      systemMessage: `**Generated image:**\n\n${imageList}`,
      action: "generate-image",
      actionPayload: { prompt, assets, },
      handled: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      systemMessage: `**Image generation failed:** ${msg}`,
      handled: true,
    };
  }
},);
