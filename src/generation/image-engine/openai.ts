// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { safeFetch, safeJsonStringify, } from "../../utils";
import { decodeB64, failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/** Generate images via the OpenAI-compatible images endpoint. */
export async function generateOpenAI(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const outputFormat = opts.outputFormat ?? "png";
  const n = opts.n;
  const size = opts.size ?? `${sdConfig.defaults.width}x${sdConfig.defaults.height}`;
  const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/v1/images/generations`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(sdConfig.apiKey && { Authorization: `Bearer ${sdConfig.apiKey}`, }),
  };
  const payload = safeJsonStringify({
    prompt: opts.prompt,
    n,
    size,
    output_format: outputFormat,
    ...(opts.negativePrompt && { negative_prompt: opts.negativePrompt, }),
  },);
  // Base64 image payloads can exceed safeFetch's default size cap.
  const result = await safeFetch<{ data: { b64_json: string }[] }>(url, {
    method: "POST",
    headers,
    body: payload.ok ? payload.value : "{}",
    timeout: sdConfig.generationTimeout ?? 60_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!result.ok) {
    return failure(`Image generation failed: ${result.error.message}`, 502,);
  }

  const data = result.data;
  return ok(
    Array.from(data.data, (d,) => decodeB64(d.b64_json,),),
    outputFormat === "jpeg" ? "image/jpeg" : "image/png",
  );
}
