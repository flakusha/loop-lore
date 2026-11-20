// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { randomUUID, } from "node:crypto";
import type { ImageProviderConfig, } from "../../config/schema";
import { getLogger, type Logger, } from "../../logger";
import { validateProviderUrl, } from "../../utils/url-validation";
import { discoverLoras, } from "../lora/discovery";
import { injectComfyUILora, } from "../lora/discovery-comfyui";
import type { LoRAModel, } from "../lora/types";
import { ComfyUIClient, } from "../providers/comfyui";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { uploadImageToComfy, } from "../providers/comfyui-upload";
import { loadComfyUIWorkflow, } from "../workflow-loader";
import { failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/**
 * Lazily resolve the module logger (null before logger init).
 * @returns the child logger, or null when no root logger exists yet
 */
function log(): Logger | null {
  try {
    return getLogger().child({ module: "image-engine/comfyui", },);
  } catch {
    return null;
  }
}

/**
 * Generate images via a ComfyUI workflow (loaded + substituted from disk).
 * @param sdConfig
 * @param opts
 * @returns {Promise<ImageGenOutcome>}
 */
export async function generateComfyUI(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const workflowName = opts.workflow ?? "txt2img";
  const validatedComfy = validateProviderUrl(sdConfig.baseUrl,);
  if (!validatedComfy.ok) {
    return failure(`Invalid ComfyUI URL: ${validatedComfy.error}`, 400,);
  }

  // img2img's LoadImage node needs an uploaded source; without one the
  // substitution would submit an empty filename and produce garbage.
  if (workflowName === "img2img" && !opts.initImage) {
    return failure('The "img2img" workflow requires an init image', 400,);
  }

  let uploadedInitImage: string | undefined;
  if (opts.initImage) {
    // Filename derives from the asset id — never from caller input. The
    // upload helper sets overwrite:true, so a re-run is idempotent.
    try {
      uploadedInitImage = await uploadImageToComfy(
        sdConfig.baseUrl,
        sdConfig.generationTimeout ?? 120_000,
        opts.initImage.buffer,
        `init-${opts.initImage.assetId}.png`,
        opts.apiKey ?? sdConfig.apiKey,
      );
    } catch (error) {
      return failure(
        `Init image upload failed: ${error instanceof Error ? error.message : String(error,)}`,
        502,
      );
    }
  }

  let workflow = await loadComfyUIWorkflow(workflowName, {
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    width: sdConfig.defaults.width,
    height: sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfgScale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    seed: opts.seed,
    model: opts.model ?? sdConfig.models?.checkpoint,
    clip: opts.clip ?? sdConfig.models?.clip,
    vae: opts.vae ?? sdConfig.models?.vae,
    clip_vision: opts.clipVision ?? sdConfig.models?.clip_vision,
    lora: opts.lora?.name,
    ...(opts.initImage
      ? {
        input_image: uploadedInitImage,
        denoise_strength: opts.denoisingStrength ?? 0.7,
      }
      : {}),
  },);

  // LoRA opt-in: discover available models and inject if found; warn and skip if unknown.
  // LoRA opt-in: discover available models and inject if found; warn and skip if unknown.
  if (opts.lora) {
    const discovered = await discoverLoras("comfyui", sdConfig.baseUrl,);
    const found = discovered.models.some(
      (m: LoRAModel,) => m.name === opts.lora!.name,
    );

    if (found) {
      // Cast: injectComfyUILora returns Record<string,unknown> which satisfies ComfyUIWorkflow
      workflow = injectComfyUILora(
        workflow,
        opts.lora.name,
        opts.lora.strength,
      ) as ComfyUIWorkflow;
    } else {
      log()?.warn(
        "LoRA not found on backend, skipping injection",
        { loraName: opts.lora.name, backendUrl: sdConfig.baseUrl, },
      );
    }
  }

  const comfyClient = new ComfyUIClient({
    baseUrl: sdConfig.baseUrl,
    timeout: sdConfig.generationTimeout ?? 120_000,
    // BYO key for reverse-proxy-fronted engines — the same auth seam the
    // sd.cpp and video paths use (Bearer; absent for stock ComfyUI).
    apiKey: opts.apiKey ?? sdConfig.apiKey,
    clientId: randomUUID(),
    onProgress: (event,) => {
      log()?.child({ module: "image-engine/comfyui.progress", },).debug("ComfyUI progress", {
        promptId: event.promptId,
        value: event.value,
        max: event.max,
        node: event.node,
      },);
    },
  },);

  const buffers = await comfyClient.runWorkflow(workflow,);
  return ok(buffers, "image/png",);
}
