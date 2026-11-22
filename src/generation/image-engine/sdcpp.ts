// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { getLogger, type Logger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { findLoraModel, } from "../lora/apply-slots";
import { discoverLoras, } from "../lora/discovery";
import { injectSdCppLora, } from "../lora/discovery-sdserver";
import type { LoRAConfig, } from "../lora/types";
import { decodeImages, failure, } from "./helpers";
import { runSdServerJob, sdServerAuthHeaders, SdServerJobError, } from "./sd-server-jobs";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/**
 * Lazily resolve the module logger (null before logger init).
 * @returns the child logger, or null when no root logger exists yet
 */
function log(): Logger | null {
  try {
    return getLogger().child({ module: "image-engine/sdcpp", },);
  } catch {
    return null;
  }
}

/**
 * Emit one sd.cpp prompt prefix per discovered LoRA. Unknown names are
 * warned-and-skipped so the rest of the generation still runs.
 */
async function applySdCppLoras(
  prompt: string,
  loras: readonly LoRAConfig[],
  baseUrl: string,
): Promise<string> {
  const discovered = await discoverLoras("sd-server", baseUrl,);
  let effective = prompt;

  // injectSdCppLora prepends, so walk backwards to keep caller order.
  for (let i = loras.length - 1; i >= 0; i--) {
    const lora = loras[i]!;
    const model = findLoraModel(lora.name, discovered.models,);
    if (!model) {
      log()?.warn(
        "LoRA not found on backend, skipping injection",
        { loraName: lora.name, backendUrl: baseUrl, },
      );

      continue;
    }

    // Keep the caller's token shape: a full filename stays a filename, a
    // stripped name stays a name.
    const token = model.filename === lora.name ? model.filename : model.name;
    effective = injectSdCppLora(effective, token, lora.strength,);
  }

  return effective;
}

/**
 * Generate images via sd.cpp — async job submission + polling.
 * @param sdConfig
 * @param opts
 * @returns {Promise<ImageGenOutcome>}
 */
export async function generateSDCPP(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const outputFormat = opts.outputFormat ?? "png";
  const n = opts.n;
  const sdcppUrl = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/img_gen`;

  // LoRA opt-in: one prefix per requested LoRA; unknown names degrade
  // gracefully to a warn-and-skip.
  const effectivePrompt = opts.lora && opts.lora.length > 0
    ? await applySdCppLoras(opts.prompt, opts.lora, sdcppUrl,)
    : opts.prompt;

  const sdcppPayload = safeJsonStringify({
    prompt: effectivePrompt,
    negative_prompt: opts.negativePrompt ?? sdConfig.defaults.negativePrompt,
    width: opts.width ?? sdConfig.defaults.width,
    height: opts.height ?? sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfg_scale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    seed: opts.seed ?? -1,
    batch_size: n,
    output_format: outputFormat,
    enable_hr: opts.enableHr ?? false,
    hr_scale: opts.hrScale,
    denoising_strength: opts.denoise,
  },);

  // Job status carries base64 images — can exceed safeFetch's default size cap.
  // Submit + poll live in the shared sd-server transport (single implementation
  // for image-engine and image-edit); the timeout source is `generationTimeout`.
  try {
    const jobImages = await runSdServerJob({
      baseUrl: sdConfig.baseUrl.replace(/\/+$/, "",),
      endpoint: "img_gen",
      body: sdcppPayload.ok ? sdcppPayload.value : {},
      headers: sdServerAuthHeaders(opts.apiKey ?? sdConfig.apiKey,),
      generationTimeoutMs: sdConfig.generationTimeout,
    },);

    return decodeImages(jobImages, outputFormat === "jpeg" ? "image/jpeg" : "image/png",);
  } catch (error) {
    if (error instanceof SdServerJobError) {
      return failure(error.message, error.status,);
    }

    throw error;
  }
}
