// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { randomUUID, } from "node:crypto";
import type { ImageProviderConfig, } from "../../config/schema";
import { getLogger, type Logger, } from "../../logger";
import { validateProviderUrl, } from "../../utils/url-validation";
import { applyLoraSlots, resolveLoraSlotFiles, resolveLoraSlotNode, } from "../lora/apply-slots";
import { discoverLoras, } from "../lora/discovery";
import { injectComfyUILora, } from "../lora/discovery-comfyui";
import type { LoRAConfig, LoRAModel, } from "../lora/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { ComfyUIClient, } from "../providers/comfyui";
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

/** Outcome of applying LoRAs to a loaded graph. */
type LoraApplyResult = { ok: true; workflow: ComfyUIWorkflow } | { ok: false; error: string };

/**
 * Slot-capable nodes take the full discovered filename in their WAS rows;
 * other graphs keep the legacy core LoraLoader injection path.
 */
async function applyRequestedLoras(
  workflow: ComfyUIWorkflow,
  loras: readonly LoRAConfig[],
  baseUrl: string,
): Promise<LoraApplyResult> {
  const discovered = await discoverLoras("comfyui", baseUrl,);
  const slotNode = resolveLoraSlotNode(workflow,);

  if (!slotNode) {
    for (const lora of loras) {
      const found = discovered.models.some(
        (m: LoRAModel,) => m.filename === lora.name || m.name === lora.name,
      );

      if (found) {
        workflow = injectComfyUILora(workflow, lora.name, lora.strength,) as ComfyUIWorkflow;
      } else {
        log()?.warn(
          "LoRA not found on backend, skipping injection",
          { loraName: lora.name, backendUrl: baseUrl, },
        );
      }
    }

    return { ok: true, workflow, };
  }

  try {
    return {
      ok: true,
      workflow: applyLoraSlots(
        workflow,
        slotNode,
        resolveLoraSlotFiles(loras, discovered.models,),
      ) as ComfyUIWorkflow,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
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
    width: opts.width ?? sdConfig.defaults.width,
    height: opts.height ?? sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfgScale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    scheduler: opts.scheduler,
    denoise: opts.denoise ?? 1,
    seed: opts.seed,
    model: opts.model ?? sdConfig.models?.checkpoint,
    clip: opts.clip ?? sdConfig.models?.clip,
    vae: opts.vae ?? sdConfig.models?.vae,
    clip_vision: opts.clipVision ?? sdConfig.models?.clip_vision,
    ...(opts.initImage
      ? {
        input_image: uploadedInitImage,
        // The img2img graph's legacy widget name; both read the one `denoise`
        // option, so the two widget names can never disagree.
        denoise_strength: opts.denoise ?? 0.7,
      }
      : {}),
  },);

  // Slot graphs (the shipped qwen exports) take the full filename in their
  // WAS rows; other graphs keep the existing core LoraLoader injection.
  if (opts.lora && opts.lora.length > 0) {
    const applied = await applyRequestedLoras(workflow, opts.lora, sdConfig.baseUrl,);
    if (!applied.ok) { return failure(applied.error, 400,); }
    workflow = applied.workflow;
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
