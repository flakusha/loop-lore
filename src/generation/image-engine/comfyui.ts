// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { getLogger, type Logger, } from "../../logger";
import { validateProviderUrl, } from "../../utils/url-validation";
import { discoverLoras, } from "../lora/discovery";
import { injectComfyUILora, } from "../lora/discovery-comfyui";
import type { LoRAModel, } from "../lora/types";
import { ComfyUIClient, } from "../providers/comfyui";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
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

  let workflow = await loadComfyUIWorkflow(workflowName, {
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    width: sdConfig.defaults.width,
    height: sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfgScale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    seed: opts.seed,
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
  },);

  const buffers = await comfyClient.runWorkflow(workflow,);
  return ok(buffers, "image/png",);
}
