import { createAsset, linkAsset } from "../assets/service";
import { extractImageMetadata } from "../assets/metadata";
import { loadConfig } from "../config/load";
import { getDatabase } from "../db/index";
import { uid, safeJsonStringify } from "../utils";
import { validateProviderUrl } from "../utils/url-validation";

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
}

export async function handleImageGeneration(body: unknown): Promise<Response> {
  const req = body as ImageGenBody;

  if (!req.prompt) {
    return Response.json({ error: "Missing required field: prompt", status: 400 }, { status: 400 });
  }

  const config = loadConfig();
  const sdConfig = config.generation.providers.sd;
  if (!sdConfig) {
    return Response.json(
      {
        error:
          "No image generation provider configured. Set config.generation.providers.sd in your config file.",
        status: 501,
      },
      { status: 501 },
    );
  }

  const n = Math.min(req.n ?? 1, 4);
  const outputFormat = req.output_format ?? "png";

  const validated = validateProviderUrl(sdConfig.baseUrl);
  if (!validated.ok) {
    return Response.json(
      { error: `Invalid image provider URL: ${validated.error}`, status: 400 },
      { status: 400 },
    );
  }

  let images: Buffer[];
  let mimeType: string;

  switch (sdConfig.apiFamily) {
    case "openai": {
      const size = req.size ?? `${sdConfig.defaults.width}x${sdConfig.defaults.height}`;
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "")}/v1/images/generations`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(sdConfig.apiKey && { Authorization: `Bearer ${sdConfig.apiKey}` }),
      };
      const payload = safeJsonStringify({
        prompt: req.prompt,
        n,
        size,
        output_format: outputFormat,
        ...(req.negative_prompt && { negative_prompt: req.negative_prompt }),
      });
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: payload.ok ? payload.value : "{}",
        signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 60_000),
      });

      let errText = "unknown";
      if (!resp.ok) {
        try {
          errText = await resp.text();
        } catch {
          /* ignore */
        }
        return Response.json({ error: `Image generation failed: ${errText}`, status: 502 }, { status: 502 });
      }

      const data = (await resp.json()) as { data: { b64_json: string }[] };
      images = data.data.map((d) => Buffer.from(d.b64_json, "base64"));
      mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";

      break;
    }
    case "sdapi": {
      const url = `${sdConfig.baseUrl.replace(/\/+$/, "")}/sdapi/v1/txt2img`;
      const sdPayload = safeJsonStringify({
        prompt: req.prompt,
        negative_prompt: req.negative_prompt ?? sdConfig.defaults.negativePrompt ?? "",
        width: sdConfig.defaults.width,
        height: sdConfig.defaults.height,
        steps: req.steps ?? sdConfig.defaults.steps,
        cfg_scale: req.cfgScale ?? sdConfig.defaults.cfgScale,
        sampler_name: req.sampler_name ?? sdConfig.defaults.sampler,
        batch_size: n,
      });
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sdPayload.ok ? sdPayload.value : "{}",
        signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 120_000),
      });

      let sdapiErrText = "unknown";
      if (!resp.ok) {
        try {
          sdapiErrText = await resp.text();
        } catch {
          /* ignore */
        }
        return Response.json(
          { error: `Image generation failed: ${sdapiErrText}`, status: 502 },
          { status: 502 },
        );
      }

      const sdData = (await resp.json()) as { images: string[] };
      images = sdData.images.map((b64) => Buffer.from(b64, "base64"));
      mimeType = "image/png";

      break;
    }
    case "sdcpp": {
      const sdcppUrl = `${sdConfig.baseUrl.replace(/\/+$/, "")}/sdcpp/v1/img_gen`;
      const sdcppPayload = safeJsonStringify({
        prompt: req.prompt,
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
      });

      const submitResp = await fetch(sdcppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sdcppPayload.ok ? sdcppPayload.value : "{}",
        signal: AbortSignal.timeout(30_000),
      });

      if (!submitResp.ok) {
        const errText = await submitResp.text().catch(() => "unknown");
        return Response.json(
          { error: `sd.cpp job submission failed: ${errText}`, status: 502 },
          { status: 502 },
        );
      }

      const { id: jobId } = (await submitResp.json()) as { id: string };
      if (!jobId) {
        return Response.json(
          { error: "sd.cpp job submission returned no job id", status: 502 },
          { status: 502 },
        );
      }

      const genTimeout = sdConfig.generationTimeout ?? 300_000;
      const pollInterval = 500;
      const deadline = Date.now() + genTimeout;

      let jobDone = false;
      let jobImages: string[] = [];

      while (Date.now() < deadline && !jobDone) {
        const jobUrl = `${sdConfig.baseUrl.replace(/\/+$/, "")}/sdcpp/v1/jobs/${jobId}`;
        const statusResp = await fetch(jobUrl, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!statusResp.ok) {
          return Response.json(
            { error: `sd.cpp job polling failed: HTTP ${statusResp.status}`, status: 502 },
            { status: 502 },
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
              { error: "sd.cpp job completed but returned no images", status: 502 },
              { status: 502 },
            );
          }
          jobImages = statusData.images;
          jobDone = true;
        } else if (statusData.status === "failed" || statusData.status === "cancelled") {
          return Response.json(
            { error: `sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`, status: 502 },
            { status: 502 },
          );
        }

        if (!jobDone) {
          await new Promise((r) => setTimeout(r, pollInterval));
        }
      }

      if (!jobDone) {
        return Response.json({ error: "sd.cpp job timed out", status: 504 }, { status: 504 });
      }

      images = jobImages.map((b64) => Buffer.from(b64, "base64"));
      mimeType = "image/png";

      break;
    }
    default: {
      return Response.json(
        {
          error: `Image gen API family "${String(sdConfig.apiFamily)}" not implemented. Use "openai", "sdapi", or "sdcpp".`,
          status: 501,
        },
        { status: 501 },
      );
    }
  }

  const db = getDatabase();
  const assets: { id: string; url: string; filename: string; mimeType: string }[] = [];

  for (const buffer of images) {
    const assetId = uid();
    const filename = `generated-${assetId.slice(0, 8)}.${outputFormat}`;
    const meta = extractImageMetadata(buffer);
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
    });

    if (req.messageId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "message", entityId: req.messageId, label: "generated" },
      });
    }
    if (req.chatId) {
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: { entityType: "chat", entityId: req.chatId, label: "generated" },
      });
    }

    assets.push({
      id: asset.id,
      url: `/api/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
    });
  }

  return Response.json({ data: assets });
}
