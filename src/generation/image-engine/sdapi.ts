// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { safeFetch, safeJsonStringify, } from "../../utils";
import { decodeB64, failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/** Generate images via the Stable Diffusion WebUI (SDAPI) txt2img endpoint. */
export async function generateSDAPI(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const n = opts.n;
  const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdapi/v1/txt2img`;
  const sdPayload = safeJsonStringify({
    prompt: opts.prompt,
    negative_prompt: opts.negativePrompt ?? sdConfig.defaults.negativePrompt ?? "",
    width: sdConfig.defaults.width,
    height: sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfg_scale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler_name: opts.samplerName ?? sdConfig.defaults.sampler,
    batch_size: n,
  },);
  // Base64 image payloads can exceed safeFetch's default size cap.
  const result = await safeFetch<{ images: string[] }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: sdPayload.ok ? sdPayload.value : "{}",
    timeout: sdConfig.generationTimeout ?? 120_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!result.ok) {
    return failure(`Image generation failed: ${result.error.message}`, 502,);
  }

  const sdData = result.data;
  return ok(Array.from(sdData.images, (b64,) => decodeB64(b64,),), "image/png",);
}
