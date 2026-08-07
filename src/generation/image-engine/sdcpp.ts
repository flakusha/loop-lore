import type { ImageProviderConfig, } from "../../config/schema";
import { safeJsonStringify, } from "../../utils";
import { decodeB64, failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/** Generate images via sd.cpp — async job submission + polling. */
export async function generateSDCPP(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const outputFormat = opts.outputFormat ?? "png";
  const n = opts.n;
  const sdcppUrl = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/img_gen`;
  const sdcppPayload = safeJsonStringify({
    prompt: opts.prompt,
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

  const submitResp = await fetch(sdcppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: sdcppPayload.ok ? sdcppPayload.value : "{}",
    signal: AbortSignal.timeout(30_000,),
  },);

  if (!submitResp.ok) {
    let errText = "unknown";
    try {
      errText = await submitResp.text();
    } catch {
      // Error body read failed — keep "unknown" fallback
    }
    return failure(`sd.cpp job submission failed: ${errText}`, 502,);
  }

  const { id: jobId, } = (await submitResp.json()) as { id: string };
  if (!jobId) {
    return failure("sd.cpp job submission returned no job id", 502,);
  }

  const genTimeout = sdConfig.generationTimeout ?? 300_000;
  const pollInterval = 500;
  const deadline = Date.now() + genTimeout;

  let jobDone = false;
  let jobImages: string[] = [];

  while (Date.now() < deadline && !jobDone) {
    const jobUrl = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/jobs/${jobId}`;
    const statusResp = await fetch(jobUrl, {
      signal: AbortSignal.timeout(10_000,),
    },);

    if (!statusResp.ok) {
      return failure(`sd.cpp job polling failed: HTTP ${statusResp.status}`, 502,);
    }

    const statusData = (await statusResp.json()) as {
      status: string;
      progress?: number;
      images?: string[];
      error?: string;
    };

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
