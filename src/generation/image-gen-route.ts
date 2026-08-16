// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { extractImageMetadata, } from "../assets/metadata";
import { createAsset, linkAsset, } from "../assets/service";
import { loadConfig, } from "../config/load";
import { pickSdProvider, } from "../config/schema";
import { getDatabase, } from "../db/index";
import { uid, } from "../utils";
import { generateImages, } from "./image-engine";

interface ImageGenBody {
  prompt: string;
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
  // TODO: LoRA integration — enable when ready for production
  // lora?: { name: string; strength: number; backend?: "comfyui" | "sd-server" };
}

export async function handleImageGeneration(body: unknown,): Promise<Response> {
  const req = body as ImageGenBody;

  if (!req.prompt) {
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

  const n = Math.min(req.n ?? 1, 4,);
  const outputFormat = req.output_format ?? "png";

  const outcome = await generateImages(sdConfig, {
    prompt: req.prompt,
    n,
    size: req.size,
    outputFormat,
    steps: req.steps,
    cfgScale: req.cfgScale,
    samplerName: req.sampler_name,
    negativePrompt: req.negative_prompt,
    seed: req.seed,
    enableHr: req.enable_hr,
    hrScale: req.hr_scale,
    denoisingStrength: req.denoising_strength,
    workflow: req.workflow,
  },);

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const { images, mimeType, } = outcome;

  const db = getDatabase();
  const assets: { id: string; url: string; filename: string; mimeType: string }[] = [];

  for (const buffer of images) {
    const assetId = uid();
    const filename = `generated-${assetId.slice(0, 8,)}.${outputFormat}`;
    const meta = extractImageMetadata(buffer,);
    const { asset: asset, } = await createAsset({
      database: db,
      input: {
        ownerId: "system",
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
