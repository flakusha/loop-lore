import type { ImageProviderConfig, } from "../../config/schema";
import { safeJsonStringify, } from "../../utils";
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
    Array.from(data.data, (d,) => decodeB64(d.b64_json,),),
    outputFormat === "jpeg" ? "image/jpeg" : "image/png",
  );
}
