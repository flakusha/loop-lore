// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { safeFetch, safeJsonStringify, } from "../../utils";
import { discoverLoras, } from "../lora/discovery";
import { injectSdCppLora, } from "../lora/discovery-sdserver";
import type { LoRAModel, } from "../lora/types";
import { decodeB64, failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";
/**
 * Generate images via sd.cpp — async job submission + polling.
 * @param sdConfig
 * @param opts
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
      console.warn(
        `[sdcpp] LoRA "${opts.lora.name}" not found on backend "${sdcppUrl}", skipping injection`,
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
  const submitResult = await safeFetch<{ id: string }>(sdcppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: sdcppPayload.ok ? sdcppPayload.value : "{}",
    timeout: 30_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!submitResult.ok) {
    return failure(`sd.cpp job submission failed: ${submitResult.error.message}`, 502,);
  }

  const { id: jobId, } = submitResult.data;
  if (!jobId) {
    return failure("sd.cpp job submission returned no job id", 502,);
  }

  const genTimeout = sdConfig.generationTimeout ?? 300_000;
  const pollInterval = 500;
  const deadline = Date.now() + genTimeout;

  let jobDone = false;
  let jobImages: string[] = [];

  while (!jobDone && Date.now() < deadline) {
    const jobUrl = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/jobs/${jobId}`;
    const statusResult = await safeFetch<{
      status: string;
      progress?: number;
      images?: string[];
      error?: string;
    }>(jobUrl, {
      timeout: 10_000,
      maxSize: Number.MAX_SAFE_INTEGER,
      handle401: false,
    },);

    if (!statusResult.ok) {
      return failure(`sd.cpp job polling failed: ${statusResult.error.message}`, 502,);
    }

    const statusData = statusResult.data;

    if (statusData.status === "done") {
      if (!statusData.images || statusData.images.length === 0) {
        return failure("sd.cpp job completed but returned no images", 502,);
      }
      jobImages = statusData.images;
      jobDone = true;
    } else if (statusData.status === "failed" || statusData.status === "cancelled") {
      return failure(
        `sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`,
        502,
      );
    }

    if (!jobDone) {
      await new Promise((r,) => setTimeout(r, pollInterval,));
    }
  }

  if (!jobDone) {
    return failure("sd.cpp job timed out", 504,);
  }

  return ok(Array.from(jobImages, (b64,) => decodeB64(b64,),), "image/png",);
}
