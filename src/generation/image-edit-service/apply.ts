// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Apply-edit dispatcher ────────────────────────────────

import { randomUUID, } from "node:crypto";
import { createAsset, getAsset, linkAsset, } from "../../assets/service";
import { loadConfig, } from "../../config/load";
import { pickSdProvider, } from "../../config/schema";
import { AssetLinkEntity, } from "../../db/enums";
import { jsonStringifyOr, safeFetch, } from "../../utils";
import { validateProviderUrl, } from "../../utils/url-validation";
import type { EditTemplate, ParsedCommand, } from "../image-edit-commands";
import type { ImageEditServiceContext, } from "./types";

/** */
export interface ApplyEditArgs {
  thisL: ImageEditServiceContext;
  opts: {
    sourceAssetId: string;
    template: EditTemplate;
    denoisingStrength: number;
    parsed: ParsedCommand;
    actorId: string;
  };
}

/**
 * Apply an edit using the generation pipeline.
 * @param root0
 * @param root0.thisL
 * @param root0.opts
 */
export async function applyEdit(
  { thisL, opts, }: ApplyEditArgs,
): Promise<string> {
  const config = loadConfig();
  const sdConfig = pickSdProvider(config.generation.providers.sd, "edit",);

  if (!sdConfig) {
    throw new Error("No image generation provider configured",);
  }

  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    throw new Error(`Invalid image provider URL: ${validated.error}`,);
  }

  // Build img2img request
  const prompt = opts.template.promptModifier;
  const negativePrompt = opts.template.negativePrompt ?? "";

  let resultImages: Buffer[];
  const mimeType = "image/png";

  switch (sdConfig.apiFamily) {
    case "sdapi": {
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdapi/v1/img2img`;

      // Get source image as base64
      const sourceAsset = await getAsset(thisL.db, opts.sourceAssetId,);
      if (!sourceAsset) {
        throw new Error("Source asset not found",);
      }

      // Read the file and convert to base64
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const filePath = path.join(
        config.assets.uploadDir,
        sourceAsset.storage_path,
      );
      const imageBuffer = await fs.readFile(filePath,);
      const base64Image = imageBuffer.toString("base64",);

      const payload = jsonStringifyOr({
        init_images: [base64Image,],
        prompt,
        negative_prompt: negativePrompt,
        denoising_strength: opts.denoisingStrength,
        steps: opts.template.steps ?? sdConfig.defaults.steps,
        cfg_scale: opts.template.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler_name: sdConfig.defaults.sampler,
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
      },);

      // Base64 image payloads can exceed safeFetch's default size cap.
      const result = await safeFetch<{ images: string[] }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: payload,
        timeout: sdConfig.generationTimeout ?? 120_000,
        maxSize: Number.MAX_SAFE_INTEGER,
        handle401: false,
      },);

      if (!result.ok) {
        throw new Error(`img2img generation failed: ${result.error.message}`,);
      }

      resultImages = Array.from(result.data.images, (b64,) => Buffer.from(b64, "base64",),);
      break;
    }
    case "openai": {
      // OpenAI doesn't support img2img directly, use DALL-E for editing
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/v1/images/edits`;

      const formData = new FormData();

      // Get source image
      const sourceAsset = await getAsset(thisL.db, opts.sourceAssetId,);
      if (!sourceAsset) {
        throw new Error("Source asset not found",);
      }

      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const filePath = path.join(
        config.assets.uploadDir,
        sourceAsset.storage_path,
      );
      const imageBlob = new Blob([await fs.readFile(filePath,),],);

      formData.append("image", imageBlob, "source.png",);
      formData.append("prompt", prompt,);
      formData.append("n", "1",);
      formData.append("size", `${sdConfig.defaults.width}x${sdConfig.defaults.height}`,);

      const headers: Record<string, string> = {};
      if (sdConfig.apiKey) {
        headers.Authorization = `Bearer ${sdConfig.apiKey}`;
      }

      const result = await safeFetch<{ data: { b64_json: string }[] }>(url, {
        method: "POST",
        headers,
        body: formData,
        timeout: sdConfig.generationTimeout ?? 60_000,
        maxSize: Number.MAX_SAFE_INTEGER,
        handle401: false,
      },);

      if (!result.ok) {
        throw new Error(`Image edit failed: ${result.error.message}`,);
      }

      resultImages = Array.from(result.data.data, (d,) => Buffer.from(d.b64_json, "base64",),);
      break;
    }
    case "sdcpp":
    case "comfyui": {
      throw new Error(
        `Image gen API family "${sdConfig.apiFamily}" not supported for img2img. Use "sdapi" or "openai".`,
      );
    }
  }

  // Store result as asset
  const db = thisL.db;
  let resultAssetId = "";

  for (const buffer of resultImages) {
    const id = randomUUID();
    const filename = `edit-${id.slice(0, 8,)}.png`;

    const { asset, } = await createAsset({
      database: db,
      input: {
        ownerId: opts.actorId,
        filename,
        mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: `Edited: ${opts.parsed.intent}`,
      },
      uploadDir: thisL.uploadDir,
    },);

    resultAssetId = asset.id;

    // Link to source asset
    await linkAsset({
      database: db,
      assetId: asset.id,
      link: {
        entityType: AssetLinkEntity.Actor,
        entityId: opts.sourceAssetId,
        label: `edit:${opts.parsed.intent}`,
      },
    },);
  }

  return resultAssetId;
}
