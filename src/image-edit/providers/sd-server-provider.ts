/**
 * sd-server Image Edit Provider — Executes templates via sd-server API
 *
 * Translates workflow templates to sd-server API calls (txt2img, img2img).
 * sd-server uses OpenAI-compatible, SDAPI, or sd.cpp API families.
 *
 * @module sd-server-provider
 */

import { loadConfig, } from "../../config/load";
import { type ImageProviderConfig, pickSdProvider, } from "../../config/schema";
import type { ImageApiFamily, } from "../../db/enums-config";
import { getLogger, } from "../../logger";
import { safeJsonStringify, uid, } from "../../utils";
import { validateProviderUrl, } from "../../utils/url-validation";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditProgress,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  SDServerCapabilities,
} from "../types";
import type { WorkflowTemplate, } from "../types";

let _log: ReturnType<typeof getLogger> | null = null;
function log() {
  _log ??= getLogger();
  return _log;
}

export class SDServerEditProvider implements ImageEditProvider {
  readonly name: ImageEditBackend = "sd-server";

  private baseUrl: string | null = null;
  private apiFamily: ImageApiFamily = "sdcpp";
  private config: ImageProviderConfig | null = null;

  private getConfig(): ImageProviderConfig | null {
    if (this.config) { return this.config; }

    const appConfig = loadConfig();
    const sdConfig = pickSdProvider(appConfig.generation.providers.sd, "edit",);
    if (!sdConfig) { return null; }

    const validated = validateProviderUrl(sdConfig.baseUrl,);
    if (!validated.ok) {
      log().warn({ message: "Invalid sd-server URL", error: validated.error, },);
      return null;
    }

    this.baseUrl = sdConfig.baseUrl.replace(/\/+$/, "",);
    this.apiFamily = sdConfig.apiFamily ?? "sdcpp";
    this.config = sdConfig;
    return sdConfig;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const cfg = this.getConfig();
      if (!this.baseUrl || !cfg) { return false; }

      const res = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(5000,),
      },);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listCapabilities(): Promise<ImageEditCategory[]> {
    const caps: ImageEditCategory[] = ["txt2img", "img2img",];

    const cfg = this.getConfig();
    if (cfg) {
      // ControlNet available if configured
      if ("controlNetPath" in cfg && cfg.controlNetPath) {
        caps.push("controlnet",);
      }
      // Upscale available if upscaler models configured
      if ("hiresUpscalersDir" in cfg && cfg.hiresUpscalersDir) {
        caps.push("upscale",);
      }
    }

    return caps;
  }

  async getCapabilities(): Promise<SDServerCapabilities> {
    const features = await this.listCapabilities();
    return {
      apiFamily: this.apiFamily,
      features,
      models: [],
    };
  }

  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    const cfg = this.getConfig();
    if (!cfg || !this.baseUrl) {
      throw new Error("sd-server not configured. Set config.generation.providers.sd",);
    }

    onProgress?.({ status: "pending", message: "Building request...", },);

    switch (template.category) {
      case "txt2img": {
        return this.executeTxt2Img(request.params, cfg, onProgress,);
      }
      case "img2img": {
        return this.executeImg2Img(request.params, cfg, onProgress,);
      }
      case "upscale": {
        return this.executeUpscale(request.params, onProgress,);
      }
      default: {
        throw new Error(`sd-server does not support category: ${template.category}`,);
      }
    }
  }

  private async executeTxt2Img(
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
    const emotionModifier = emotion ? this.getEmotionModifier(emotion,) : "";
    const finalPrompt = emotionModifier ? `${prompt}, ${emotionModifier}` : prompt;

    if (this.apiFamily === "sdcpp") {
      return this.sdcppGenerate("txt2img", {
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

    if (this.apiFamily === "sdapi") {
      return this.sdapiGenerate("txt2img", {
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
    return this.openaiGenerate({
      prompt: finalPrompt,
      n: 1,
      size: `${width}x${height}`,
      output_format: "png",
    },);
  }

  /**
   * Get emotion-based prompt modifier for SD generation.
   * Maps emotion types to descriptive prompt suffixes.
   */
  private getEmotionModifier(emotion: string,): string {
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

  private async executeImg2Img(
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

    if (this.apiFamily === "sdcpp") {
      return this.sdcppGenerate("img2img", {
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

    if (this.apiFamily === "sdapi") {
      return this.sdapiGenerate("img2img", {
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

  private async executeUpscale(
    params: Record<string, unknown>,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    onProgress?.({ status: "running", message: "Upscaling image...", },);

    const inputImage = (params.input_image as string) ?? "";
    const upscaleModel = (params.upscale_model as string) ?? "RealESRGAN_x4plus";

    if (this.apiFamily === "sdapi") {
      const url = `${this.baseUrl}/sdapi/v1/extra-single-image`;
      const payload = safeJsonStringify({
        image: inputImage,
        upscale_model: upscaleModel,
      },);

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: payload.ok ? payload.value : "{}",
        signal: AbortSignal.timeout(120_000,),
      },);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "unknown");
        throw new Error(`Upscale failed: ${errText}`,);
      }

      await resp.json() as { image: string };
      const id = uid();

      return [{
        id,
        filename: `upscaled-${id.slice(0, 8,)}.png`,
        url: `/api/assets/${id}/raw`,
        mimeType: "image/png",
      },];
    }

    throw new Error(`Upscale not supported with ${this.apiFamily} API family`,);
  }

  // ── API family implementations ───────────────────────────

  private async sdcppGenerate(
    endpoint: string,
    body: Record<string, unknown>,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    const url = `${this.baseUrl}/sdcpp/v1/${endpoint}`;

    const submitPayload = safeJsonStringify(body,);
    const submitResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: submitPayload.ok ? submitPayload.value : "{}",
      signal: AbortSignal.timeout(30_000,),
    },);

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => "unknown");
      throw new Error(`sd.cpp job submission failed: ${errText}`,);
    }

    const { id: jobId, } = (await submitResp.json()) as { id: string };
    if (!jobId) { throw new Error("sd.cpp returned no job id",); }

    onProgress?.({ status: "running", progress: 0.1, message: "Processing...", },);

    // Poll for completion
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      const jobUrl = `${this.baseUrl}/sdcpp/v1/jobs/${jobId}`;
      const statusResp = await fetch(jobUrl, { signal: AbortSignal.timeout(10_000,), },);

      if (!statusResp.ok) {
        throw new Error(`sd.cpp polling failed: HTTP ${statusResp.status}`,);
      }

      const statusData = (await statusResp.json()) as {
        status: string;
        progress?: number;
        images?: string[];
        error?: string;
      };

      if (statusData.status === "done") {
        if (!statusData.images?.length) { throw new Error("sd.cpp completed but no images",); }
        return statusData.images.map((_b64, i,) => {
          const id = uid();
          return {
            id,
            filename: `sdserver-${id.slice(0, 8,)}-${i}.png`,
            url: `/api/assets/${id}/raw`,
            mimeType: "image/png",
          };
        },);
      }

      if (statusData.status === "failed" || statusData.status === "cancelled") {
        throw new Error(`sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`,);
      }

      if (statusData.progress !== undefined) {
        onProgress?.({ status: "running", progress: statusData.progress, },);
      }

      await new Promise((r,) => setTimeout(r, 500,));
    }

    throw new Error("sd.cpp job timed out",);
  }

  private async sdapiGenerate(
    endpoint: string,
    body: Record<string, unknown>,
    _onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    const url = `${this.baseUrl}/sdapi/v1/${endpoint}`;

    const payload = safeJsonStringify(body,);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: payload.ok ? payload.value : "{}",
      signal: AbortSignal.timeout(120_000,),
    },);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      throw new Error(`sdapi ${endpoint} failed: ${errText}`,);
    }

    const data = (await resp.json()) as { images: string[] };
    return data.images.map((_b64, i,) => {
      const id = uid();
      return {
        id,
        filename: `sdapi-${id.slice(0, 8,)}-${i}.png`,
        url: `/api/assets/${id}/raw`,
        mimeType: "image/png",
      };
    },);
  }

  private async openaiGenerate(
    body: Record<string, unknown>,
  ): Promise<ImageEditResult[]> {
    const url = `${this.baseUrl}/v1/images/generations`;

    const cfg = this.getConfig();
    const payload = safeJsonStringify(body,);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(cfg?.apiKey && { Authorization: `Bearer ${cfg.apiKey}`, }),
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: payload.ok ? payload.value : "{}",
      signal: AbortSignal.timeout(60_000,),
    },);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      throw new Error(`OpenAI image gen failed: ${errText}`,);
    }

    const data = (await resp.json()) as { data: { b64_json: string }[] };
    return data.data.map((_entry, i,) => {
      const id = uid();
      return {
        id,
        filename: `openai-${id.slice(0, 8,)}-${i}.png`,
        url: `/api/assets/${id}/raw`,
        mimeType: "image/png",
      };
    },);
  }
}
