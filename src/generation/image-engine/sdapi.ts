import type { ImageProviderConfig, } from "../../config/schema";
import { safeJsonStringify, } from "../../utils";
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
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: sdPayload.ok ? sdPayload.value : "{}",
    signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 120_000,),
  },);

  if (!resp.ok) {
    let errText = "unknown";
    try {
      errText = await resp.text();
    } catch {
      // Error body read failed — keep "unknown" fallback
    }
    return failure(`Image generation failed: ${errText}`, 502,);
  }

  const sdData = (await resp.json()) as { images: string[] };
  return ok(Array.from(sdData.images, (b64,) => decodeB64(b64,),), "image/png",);
}
