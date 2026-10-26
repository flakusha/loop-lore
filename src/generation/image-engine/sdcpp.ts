// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { getLogger, type Logger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { discoverLoras, } from "../lora/discovery";
import { injectSdCppLora, } from "../lora/discovery-sdserver";
import type { LoRAModel, } from "../lora/types";
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

  // LoRA opt-in: discover available models and inject if found; warn and skip if unknown.
  let effectivePrompt = opts.prompt;
  if (opts.lora) {
    const discovered = await discoverLoras("sd-server", sdcppUrl,);
    const found = discovered.models.some(
      (m: LoRAModel,) => m.name === opts.lora!.name,
    );

    if (found) {
      effectivePrompt = injectSdCppLora(
        opts.prompt,
        opts.lora.name,
        opts.lora.strength,
      );
    } else {
      // Unknown LoRA — warn and continue without injection (graceful degradation).
      log()?.warn(
        "LoRA not found on backend, skipping injection",
        { loraName: opts.lora.name, backendUrl: sdcppUrl, },
      );
    }
  }

  const sdcppPayload = safeJsonStringify({
    prompt: effectivePrompt,
    negative_prompt: opts.negativePrompt ?? sdConfig.defaults.negativePrompt,
    width: sdConfig.defaults.width,
    height: sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfg_scale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    seed: opts.seed ?? -1,
    batch_size: n,
    output_format: outputFormat,
    enable_hr: opts.enableHr ?? false,
    hr_scale: opts.hrScale,
    denoising_strength: opts.denoisingStrength,
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
