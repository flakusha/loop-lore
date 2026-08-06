/**
 * Shared image-generation engine.
 *
 * Both the HTTP route (`generation/image-gen-route.ts`) and the emotion
 * avatar service (`characters/services/emotion-avatar-service.ts`) run the
 * same per-provider image-generation switch (openai / sdapi / sdcpp /
 * comfyui). This module hosts that switch so the callers differ only in
 * how they consume a result: the route maps failures to HTTP responses, the
 * service throws on failure. Returns a discriminated outcome carrying the
 * generated images + mime type, or an error + http status.
 *
 * @module generation/image-engine
 */

import type { ImageProviderConfig, } from "../config/schema";
import { safeJsonStringify, } from "../utils";
import { safeFromBase64, } from "../utils/safe-buffer";
import { validateProviderUrl, } from "../utils/url-validation";
import { ComfyUIClient, } from "./providers/comfyui";
import { loadComfyUIWorkflow, } from "./workflow-loader";

/** Inputs shared by every provider. */
export interface ImageGenOptions {
  prompt: string;
  n: number;
  /** openai `size`, defaults to `widthxheight`. */
  size?: string;
  /** "png" | "jpeg". */
  outputFormat: string;
  steps?: number;
  cfgScale?: number;
  samplerName?: string;
  negativePrompt?: string;
  seed?: number;
  enableHr?: boolean;
  hrScale?: number;
  denoisingStrength?: number;
  /** ComfyUI workflow name (defaults to "txt2img"). */
  workflow?: string;
}

/** Success carries the generated images and their mime type. */
export interface ImageGenSuccess {
  ok: true;
  images: Buffer[];
  mimeType: string;
}

/** Failure carries a human error and the HTTP status to report. */
export interface ImageGenFailure {
  ok: false;
  error: string;
  status: number;
}

export type ImageGenOutcome = ImageGenSuccess | ImageGenFailure;

function failure(error: string, status: number,): ImageGenFailure {
  return { ok: false, error, status, };
}

function ok(images: Buffer[], mimeType: string,): ImageGenSuccess {
  return { ok: true, images, mimeType, };
}

function decodeB64(value: string,): Buffer {
  const r = safeFromBase64(value,);
  return r.ok ? r.buffer : Buffer.alloc(0,);
}

/**
 * Generate images using the configured provider.
 *
 * @param sdConfig - Resolved image provider config
 * @param opts - Generation request inputs
 * @returns A discriminated outcome; never throws on provider failures
 */
export async function generateImages(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    return failure(`Invalid image provider URL: ${validated.error}`, 400,);
  }

  const outputFormat = opts.outputFormat ?? "png";
  const n = opts.n;

  switch (sdConfig.apiFamily) {
    case "openai": {
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
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: payload.ok ? payload.value : "{}",
        signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 60_000,),
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

      const data = (await resp.json()) as { data: { b64_json: string }[] };
      return ok(
        data.data.map((d,) => decodeB64(d.b64_json,)),
        outputFormat === "jpeg" ? "image/jpeg" : "image/png",
      );
    }
    case "sdapi": {
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
      return ok(sdData.images.map((b64,) => decodeB64(b64,)), "image/png",);
    }
    case "sdcpp": {
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

      return ok(jobImages.map((b64,) => decodeB64(b64,)), "image/png",);
    }
    case "comfyui": {
      const workflowName = opts.workflow ?? "txt2img";
      const validatedComfy = validateProviderUrl(sdConfig.baseUrl,);
      if (!validatedComfy.ok) {
        return failure(`Invalid ComfyUI URL: ${validatedComfy.error}`, 400,);
      }

      const workflow = await loadComfyUIWorkflow(workflowName, {
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
        steps: opts.steps ?? sdConfig.defaults.steps,
        cfgScale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler: opts.samplerName ?? sdConfig.defaults.sampler,
        seed: opts.seed,
      },);

      const comfyClient = new ComfyUIClient({
        baseUrl: sdConfig.baseUrl,
        timeout: sdConfig.generationTimeout ?? 120_000,
      },);

      const buffers = await comfyClient.runWorkflow(workflow,);
      return ok(buffers, "image/png",);
    }
    default: {
      return failure(
        `Image gen API family "${
          String(sdConfig.apiFamily,)
        }" not supported. Use "openai", "sdapi", "sdcpp", or "comfyui".`,
        501,
      );
    }
  }
}
