// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { extractImageMetadata, } from "../assets/metadata";
import { createAsset, linkAsset, } from "../assets/service";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import { pickSdProvider, } from "../config/schema";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { forbiddenResponse, } from "../routes/http-utils";
import { uid, } from "../utils";
import { generateImages, } from "./image-engine";
import type { LoRAConfig, } from "./lora/types";
import {
  applyImageTemplate,
  getOwnedTemplate,
} from "./template-service";
import { type ImageTemplatePayload, parseTemplatePayload, } from "./template-types";

interface ImageGenBody {
  prompt?: string;
  chatId?: string;
  messageId?: string;
  size?: string;
  n?: number;
  output_format?: string;
  steps?: number;
  cfgScale?: number;
  sampler_name?: string;
  negative_prompt?: string;
  seed?: number;
  enable_hr?: boolean;
  hr_scale?: number;
  denoising_strength?: number;
  /** ComfyUI workflow name (filename without .json in configs/workflows/) */
  workflow?: string;
  /** Optional LoRA model to inject into the generation pipeline. */
  lora?: LoRAConfig;
  /** User image-prompt template id — renders `context` into the prompt. */
  templateId?: string;
  /** {{variable}} values substituted into the template body. */
  context?: Record<string, string>;
}

/**
 * @param body
 * @param database
 * @param userId
 * @param userRole
 */
export async function handleImageGeneration(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const req = body as ImageGenBody;

  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  // Authorization: when linked to a chat, only admin, creator, or a
  // participant may generate images for it — otherwise a user could
  // attach generated assets to a foreign chat (IDOR write).
  // (BUG-generation-control-plane-routes-lack-authorization)
  if (req.chatId) {
    const db = database ?? getDatabase();
    const access = await checkChatAccess(db, req.chatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }

  const db = database ?? getDatabase();

  // FEAT-065-IMG: a user template renders the final prompt from {{variables}}
  // when provided; the raw `prompt` field is then optional.
  let prompt = req.prompt;
  let negativePrompt = req.negative_prompt;
  if (req.templateId) {
    const row = await getOwnedTemplate(db, req.templateId, userId,);
    if (!row) {
      return Response.json({ error: "Template not found", status: 404, }, { status: 404, },);
    }
    const payload = parseTemplatePayload(row.payload, row.modality,);
    if (row.modality !== "image" || !payload) {
      return Response.json(
        { error: "Template is not an image template", status: 400, },
        { status: 400, },
      );
    }
    const rendered = applyImageTemplate(payload as ImageTemplatePayload, req.context ?? {},);
    prompt = rendered.prompt;
    negativePrompt = negativePrompt ?? rendered.negativePrompt;
  }

  if (!prompt) {
    return Response.json({ error: "Missing required field: prompt", status: 400, }, { status: 400, },);
  }

  const config = loadConfig();
  const sdConfig = pickSdProvider(config.generation.providers.sd, "generate",);
  if (!sdConfig) {
    return Response.json(
      {
        error: "No image generation provider configured. Set config.generation.providers.sd in your config file.",
        status: 501,
      },
      { status: 501, },
    );
  }
  // LoRA opt-in: only comfyui + sd-server/sdcpp support it. Reject mismatched backends early.
  if (req.lora) {
    const supported = sdConfig.apiFamily === "comfyui" || sdConfig.apiFamily === "sdcpp";
    if (!supported) {
      return Response.json(
        {
          error: `LoRA is not supported on backend "${sdConfig.apiFamily}". Use comfyui or sd-server.`,
          status: 400,
        },
        { status: 400, },
      );
    }
  }

  const n = Math.min(req.n ?? 1, 4,);
  const outputFormat = req.output_format ?? "png";

  const outcome = await generateImages(sdConfig, {
    prompt,
    n,
    size: req.size,
    outputFormat,
    steps: req.steps,
    cfgScale: req.cfgScale,
    samplerName: req.sampler_name,
    negativePrompt,
    seed: req.seed,
    enableHr: req.enable_hr,
    hrScale: req.hr_scale,
    denoisingStrength: req.denoising_strength,
    workflow: req.workflow,
    lora: req.lora,
  },);

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const { images, mimeType, } = outcome;

  const assets: { id: string; url: string; filename: string; mimeType: string }[] = [];

  for (const buffer of images) {
    const assetId = uid();
    const filename = `generated-${assetId.slice(0, 8,)}.${outputFormat}`;
    const meta = extractImageMetadata(buffer,);
    const { asset, } = await createAsset({
      database: db,
      input: {
        ownerId: userId,
        filename,
        mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: `Generated: ${meta.width}x${meta.height} ${meta.format}`,
      },
      uploadDir: config.assets.uploadDir,
    },);

    if (req.messageId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "message", entityId: req.messageId, label: "generated", },
      },);
    }
    if (req.chatId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "chat", entityId: req.chatId, label: "generated", },
      },);
    }

    assets.push({
      id: asset.id,
      url: `/api/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
    },);
  }

  return Response.json({ data: assets, },);
}
