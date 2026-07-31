import { extractImageMetadata, } from "../assets/metadata";
import { createAsset, linkAsset, } from "../assets/service";
import { loadConfig, } from "../config/load";
import { pickSdProvider, } from "../config/schema";
import { getDatabase, } from "../db/index";
import { safeJsonStringify, uid, } from "../utils";
import { safeFromBase64, } from "../utils/safe-buffer";
import { validateProviderUrl, } from "../utils/url-validation";
import { ComfyUIClient, } from "./providers/comfyui";
import { loadComfyUIWorkflow, } from "./workflow-loader";
// TODO: LoRA integration — enable imports when ready for production
// import { injectSdCppLora } from "./lora/discovery-sdserver";
// import { injectComfyUILora } from "./lora/discovery-comfyui";
// import { validateLoRAConfig } from "./lora/validation";

interface ImageGenBody {
  prompt: string;
  chatId?: string;
  messageId?: string;
  size?: string;
  n?: number;
  output_format?: string;
  steps?: number;
  cfgScale?: number;
  sampler_name?: string;
  negative_prompt?: string;
  seed?: number;
  enable_hr?: boolean;
  hr_scale?: number;
  denoising_strength?: number;
  /** ComfyUI workflow name (filename without .json in configs/workflows/) */
  workflow?: string;
  // TODO: LoRA integration — enable when ready for production
  // lora?: { name: string; strength: number; backend?: "comfyui" | "sd-server" };
}

export async function handleImageGeneration(body: unknown,): Promise<Response> {
  const req = body as ImageGenBody;

  if (!req.prompt) {
    return Response.json({ error: "Missing required field: prompt", status: 400, }, { status: 400, },);
  }

  const config = loadConfig();
  const sdConfig = pickSdProvider(config.generation.providers.sd, "generate",);
  if (!sdConfig) {
    return Response.json(
      {
        error: "No image generation provider configured. Set config.generation.providers.sd in your config file.",
        status: 501,
      },
      { status: 501, },
    );
  }

  const n = Math.min(req.n ?? 1, 4,);
  const outputFormat = req.output_format ?? "png";

  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    return Response.json(
      { error: `Invalid image provider URL: ${validated.error}`, status: 400, },
      { status: 400, },
    );
  }

  let images: Buffer[];
  let mimeType: string;

  switch (sdConfig.apiFamily) {
    case "openai": {
      // TODO: LoRA integration — OpenAI API doesn't support LoRA directly
      // For OpenAI-compatible backends, LoRA would need to be applied server-side
      const size = req.size ?? `${sdConfig.defaults.width}x${sdConfig.defaults.height}`;
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/v1/images/generations`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(sdConfig.apiKey && { Authorization: `Bearer ${sdConfig.apiKey}`, }),
      };
      const payload = safeJsonStringify({
        prompt: req.prompt,
        n,
        size,
        output_format: outputFormat,
        ...(req.negative_prompt && { negative_prompt: req.negative_prompt, }),
      },);
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: payload.ok ? payload.value : "{}",
        signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 60_000,),
      },);

      let errText = "unknown";
      if (!resp.ok) {
        try {
          errText = await resp.text();
        } catch {
          /* ignore */
        }
        return Response.json({ error: `Image generation failed: ${errText}`, status: 502, }, { status: 502, },);
      }

      const data = (await resp.json()) as { data: { b64_json: string }[] };
      images = data.data.map((d,) => {
        const r = safeFromBase64(d.b64_json,);
        return r.ok ? r.buffer : Buffer.alloc(0,);
      },);
      mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";

      break;
    }
    case "sdapi": {
      // TODO: LoRA integration — sdapi (A1111/Forge) supports LoRA via prompt injection
      // When enabled, inject LoRA into prompt similar to sdcpp path
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdapi/v1/txt2img`;
      const sdPayload = safeJsonStringify({
        prompt: req.prompt,
        negative_prompt: req.negative_prompt ?? sdConfig.defaults.negativePrompt ?? "",
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
        steps: req.steps ?? sdConfig.defaults.steps,
        cfg_scale: req.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler_name: req.sampler_name ?? sdConfig.defaults.sampler,
        batch_size: n,
      },);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: sdPayload.ok ? sdPayload.value : "{}",
        signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 120_000,),
      },);

      let sdapiErrText = "unknown";
      if (!resp.ok) {
        try {
          sdapiErrText = await resp.text();
        } catch {
          /* ignore */
        }
        return Response.json(
          { error: `Image generation failed: ${sdapiErrText}`, status: 502, },
          { status: 502, },
        );
      }

      const sdData = (await resp.json()) as { images: string[] };
      images = sdData.images.map((b64,) => {
        const r = safeFromBase64(b64,);
        return r.ok ? r.buffer : Buffer.alloc(0,);
      },);
      mimeType = "image/png";

      break;
    }
    case "sdcpp": {
      const sdcppUrl = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/img_gen`;

      // TODO: LoRA integration — enable when ready for production
      // When enabled, inject LoRA into prompt:
      // let finalPrompt = req.prompt;
      // if (req.lora) {
      //   const loraError = validateLoRAConfig(req.lora);
      //   if (loraError) {
      //     return Response.json({ error: `Invalid LoRA config: ${loraError}`, status: 400 }, { status: 400 });
      //   }
      //   finalPrompt = injectSdCppLora(req.prompt, req.lora.name, req.lora.strength);
      // }
      const finalPrompt = req.prompt;

      const sdcppPayload = safeJsonStringify({
        prompt: finalPrompt,
        negative_prompt: req.negative_prompt ?? sdConfig.defaults.negativePrompt,
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
        steps: req.steps ?? sdConfig.defaults.steps,
        cfg_scale: req.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler: req.sampler_name ?? sdConfig.defaults.sampler,
        seed: req.seed ?? -1,
        batch_size: n,
        output_format: outputFormat,
        enable_hr: req.enable_hr ?? false,
        hr_scale: req.hr_scale,
        denoising_strength: req.denoising_strength,
      },);

      const submitResp = await fetch(sdcppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: sdcppPayload.ok ? sdcppPayload.value : "{}",
        signal: AbortSignal.timeout(30_000,),
      },);

      if (!submitResp.ok) {
        const errText = await submitResp.text().catch(() => "unknown");
        return Response.json(
          { error: `sd.cpp job submission failed: ${errText}`, status: 502, },
          { status: 502, },
        );
      }

      const { id: jobId, } = (await submitResp.json()) as { id: string };
      if (!jobId) {
        return Response.json(
          { error: "sd.cpp job submission returned no job id", status: 502, },
          { status: 502, },
        );
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
          return Response.json(
            { error: `sd.cpp job polling failed: HTTP ${statusResp.status}`, status: 502, },
            { status: 502, },
          );
        }

        const statusData = (await statusResp.json()) as {
          status: string;
          progress?: number;
          images?: string[];
          error?: string;
        };

        if (statusData.status === "done") {
          if (!statusData.images || statusData.images.length === 0) {
            return Response.json(
              { error: "sd.cpp job completed but returned no images", status: 502, },
              { status: 502, },
            );
          }
          jobImages = statusData.images;
          jobDone = true;
        } else if (statusData.status === "failed" || statusData.status === "cancelled") {
          return Response.json(
            { error: `sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`, status: 502, },
            { status: 502, },
          );
        }

        if (!jobDone) {
          await new Promise((r,) => setTimeout(r, pollInterval,));
        }
      }

      if (!jobDone) {
        return Response.json({ error: "sd.cpp job timed out", status: 504, }, { status: 504, },);
      }

      images = jobImages.map((b64,) => {
        const r = safeFromBase64(b64,);
        return r.ok ? r.buffer : Buffer.alloc(0,);
      },);
      mimeType = "image/png";

      break;
    }
    case "comfyui": {
      const workflowName = req.workflow ?? "txt2img";
      const validatedComfy = validateProviderUrl(sdConfig.baseUrl,);
      if (!validatedComfy.ok) {
        return Response.json(
          { error: `Invalid ComfyUI URL: ${validatedComfy.error}`, status: 400, },
          { status: 400, },
        );
      }

      const workflow = await loadComfyUIWorkflow(workflowName, {
        prompt: req.prompt,
        negativePrompt: req.negative_prompt,
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
        steps: req.steps ?? sdConfig.defaults.steps,
        cfgScale: req.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler: req.sampler_name ?? sdConfig.defaults.sampler,
        seed: req.seed,
      },);

      const comfyClient = new ComfyUIClient({
        baseUrl: sdConfig.baseUrl,
        timeout: sdConfig.generationTimeout ?? 120_000,
      },);

      const buffers = await comfyClient.runWorkflow(workflow,);
      images = buffers;
      mimeType = "image/png";

      break;
    }
    default: {
      return Response.json(
        {
          error: `Image gen API family "${
            String(sdConfig.apiFamily,)
          }" not implemented. Use "openai", "sdapi", "sdcpp", or "comfyui".`,
          status: 501,
        },
        { status: 501, },
      );
    }
  }

  const db = getDatabase();
  const assets: { id: string; url: string; filename: string; mimeType: string }[] = [];

  for (const buffer of images) {
    const assetId = uid();
    const filename = `generated-${assetId.slice(0, 8,)}.${outputFormat}`;
    const meta = extractImageMetadata(buffer,);
    const asset = await createAsset({
      database: db,
      input: {
        ownerId: "system",
        filename,
        mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: `Generated: ${meta.width}x${meta.height} ${meta.format}`,
      },
      uploadDir: config.assets.uploadDir,
    },);

    if (req.messageId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "message", entityId: req.messageId, label: "generated", },
      },);
    }
    if (req.chatId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "chat", entityId: req.chatId, label: "generated", },
      },);
    }

    assets.push({
      id: asset.id,
      url: `/api/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
    },);
  }

  return Response.json({ data: assets, },);
}
