// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../../config/schema";
import { safeFetch, safeJsonStringify, uid, } from "../../../utils";
import type { ImageEditProgress, ImageEditResult, } from "../../types";
import {
  openaiGenerate,
  sdapiGenerate,
  sdcppGenerate,
} from "./families";
import type { SDServerHost, } from "./types";

/**
 * Get emotion-based prompt modifier for SD generation.
 * Maps emotion types to descriptive prompt suffixes.
 * @param emotion
 */
function getEmotionModifier(emotion: string,): string {
  const modifiers: Record<string, string> = {
    happy: "happy expression, smiling, bright eyes, cheerful",
    sad: "sad expression, downcast eyes, melancholy, sorrowful",
    angry: "angry expression, furrowed brow, intense gaze, furious",
    fearful: "fearful expression, wide eyes, trembling, scared",
    surprised: "surprised expression, raised eyebrows, wide eyes, astonished",
    disgusted: "disgusted expression, wrinkled nose, repulsed",
    neutral: "neutral expression, calm face, natural look",
    excited: "excited expression, enthusiastic, eager, thrilled",
    anxious: "anxious expression, worried brow, nervous, tense",
    calm: "calm expression, serene face, peaceful, composed",
    confused: "confused expression, tilted head, puzzled, bewildered",
    proud: "proud expression, confident, chin up, dignified",
    shameful: "shameful expression, looking away, embarrassed, guilty",
    loving: "loving expression, warm gaze, tender, affectionate",
    jealous: "jealous expression, envious, bitter, resentful",
    grateful: "grateful expression, thankful, appreciative, warm",
    bored: "bored expression, disinterested, vacant stare, apathetic",
    contemptuous: "contemptuous expression, sneering, disdainful look",
  };
  return modifiers[emotion] ?? "";
}

/**
 * @param host
 * @param params
 * @param cfg
 * @param onProgress
 */
export async function executeTxt2Img(
  host: SDServerHost,
  params: Record<string, unknown>,
  cfg: ImageProviderConfig,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  onProgress?.({ status: "running", message: "Generating image...", },);

  const prompt = (params.prompt as string) ?? "";
  const emotion = (params.emotion as string) ?? "";
  const negative = (params.negative_prompt as string) ?? "";
  const width = (params.width as number) ?? cfg.defaults.width;
  const height = (params.height as number) ?? cfg.defaults.height;
  const steps = (params.steps as number) ?? cfg.defaults.steps;
  const cfgScale = (params.cfg_scale as number) ?? cfg.defaults.cfgScale;
  const sampler = (params.sampler as string) ?? cfg.defaults.sampler;
  const seed = (params.seed as number) ?? -1;

  // Apply emotion modifier to prompt if provided
  const emotionModifier = emotion ? getEmotionModifier(emotion,) : "";
  const finalPrompt = emotionModifier ? `${prompt}, ${emotionModifier}` : prompt;

  if (host.apiFamily === "sdcpp") {
    return sdcppGenerate(host, "txt2img", {
      prompt: finalPrompt,
      negative_prompt: negative,
      width,
      height,
      steps,
      cfg_scale: cfgScale,
      sampler,
      seed,
      batch_size: 1,
      output_format: "png",
    }, onProgress,);
  }

  if (host.apiFamily === "sdapi") {
    return sdapiGenerate(host, "txt2img", {
      prompt: finalPrompt,
      negative_prompt: negative,
      width,
      height,
      steps,
      cfg_scale: cfgScale,
      sampler_name: sampler,
      seed,
      batch_size: 1,
    }, onProgress,);
  }

  // OpenAI family
  return openaiGenerate(host, {
    prompt: finalPrompt,
    n: 1,
    size: `${width}x${height}`,
    output_format: "png",
  },);
}

/**
 * @param host
 * @param params
 * @param cfg
 * @param onProgress
 */
export async function executeImg2Img(
  host: SDServerHost,
  params: Record<string, unknown>,
  cfg: ImageProviderConfig,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  onProgress?.({ status: "running", message: "Transforming image...", },);

  const prompt = (params.prompt as string) ?? "";
  const negative = (params.negative_prompt as string) ?? "";
  const denoise = (params.denoise_strength as number) ?? 0.75;
  const steps = (params.steps as number) ?? cfg.defaults.steps;
  const cfgScale = (params.cfg_scale as number) ?? cfg.defaults.cfgScale;
  const sampler = (params.sampler as string) ?? cfg.defaults.sampler;
  const seed = (params.seed as number) ?? -1;
  const inputImage = (params.input_image as string) ?? "";

  if (host.apiFamily === "sdcpp") {
    return sdcppGenerate(host, "img2img", {
      prompt,
      negative_prompt: negative,
      init_image: inputImage,
      denoising_strength: denoise,
      steps,
      cfg_scale: cfgScale,
      sampler,
      seed,
      batch_size: 1,
      output_format: "png",
    }, onProgress,);
  }

  if (host.apiFamily === "sdapi") {
    return sdapiGenerate(host, "img2img", {
      prompt,
      negative_prompt: negative,
      init_images: [inputImage,],
      denoising_strength: denoise,
      steps,
      cfg_scale: cfgScale,
      sampler_name: sampler,
      seed,
    }, onProgress,);
  }

  throw new Error("img2img not supported with OpenAI API family",);
}

/**
 * @param host
 * @param params
 * @param onProgress
 */
export async function executeUpscale(
  host: SDServerHost,
  params: Record<string, unknown>,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  onProgress?.({ status: "running", message: "Upscaling image...", },);

  const inputImage = (params.input_image as string) ?? "";
  const upscaleModel = (params.upscale_model as string) ?? "RealESRGAN_x4plus";

  if (host.apiFamily === "sdapi") {
    const url = `${host.baseUrl}/sdapi/v1/extra-single-image`;
    const payload = safeJsonStringify({
      image: inputImage,
      upscale_model: upscaleModel,
    },);

    // Base64 image payload can exceed safeFetch's default size cap.
    const result = await safeFetch<{ image: string }>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: payload.ok ? payload.value : "{}",
      timeout: 120_000,
      maxSize: Number.MAX_SAFE_INTEGER,
      handle401: false,
    },);

    if (!result.ok) {
      throw new Error(`Upscale failed: ${result.error.message}`,);
    }

    const id = uid();

    return [{
      id,
      filename: `upscaled-${id.slice(0, 8,)}.png`,
      url: `/api/assets/${id}/raw`,
      mimeType: "image/png",
    },];
  }

  throw new Error(`Upscale not supported with ${host.apiFamily} API family`,);
}
