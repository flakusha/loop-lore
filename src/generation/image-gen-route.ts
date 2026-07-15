import { createAsset, linkAsset } from "../assets/service";
import { loadConfig } from "../config/load";
import { getDatabase } from "../db/index";
import { uid, safeJsonStringify } from "../utils";

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

  let images: Buffer[];
  let mimeType: string;

  if (sdConfig.apiFamily === "openai") {
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
  } else if (sdConfig.apiFamily === "sdapi") {
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
  } else {
    return Response.json(
      {
        error: `Image gen API family "${sdConfig.apiFamily}" not yet implemented. Use "openai" or "sdapi".`,
        status: 501,
      },
      { status: 501 },
    );
  }

  const db = getDatabase();
  const assets: { id: string; url: string; filename: string; mimeType: string }[] = [];

  for (const buffer of images) {
    const assetId = uid();
    const filename = `generated-${assetId.slice(0, 8)}.${outputFormat}`;
    const asset = await createAsset({
      database: db,
      input: {
        ownerId: "system",
        filename,
        mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
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
