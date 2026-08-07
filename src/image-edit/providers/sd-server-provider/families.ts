import { safeJsonStringify, uid, } from "../../../utils";
import type { ImageEditProgress, ImageEditResult, } from "../../types";
import type { SDServerHost, } from "./types";

export async function sdcppGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  const url = `${host.baseUrl}/sdcpp/v1/${endpoint}`;

  const submitPayload = safeJsonStringify(body,);
  const submitResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: submitPayload.ok ? submitPayload.value : "{}",
    signal: AbortSignal.timeout(30_000,),
  },);

  if (!submitResp.ok) {
    let errText = "unknown";
    try {
      errText = await submitResp.text();
    } catch {
      // Error body read failed — keep "unknown" fallback
    }
    throw new Error(`sd.cpp job submission failed: ${errText}`,);
  }

  const { id: jobId, } = (await submitResp.json()) as { id: string };
  if (!jobId) { throw new Error("sd.cpp returned no job id",); }

  onProgress?.({ status: "running", progress: 0.1, message: "Processing...", },);

  // Poll for completion
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const jobUrl = `${host.baseUrl}/sdcpp/v1/jobs/${jobId}`;
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
      return Array.from(statusData.images, (_b64, i,) => {
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

export async function sdapiGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  _onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  const url = `${host.baseUrl}/sdapi/v1/${endpoint}`;

  const payload = safeJsonStringify(body,);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: payload.ok ? payload.value : "{}",
    signal: AbortSignal.timeout(120_000,),
  },);

  if (!resp.ok) {
    let errText = "unknown";
    try {
      errText = await resp.text();
    } catch {
      // Error body read failed — keep "unknown" fallback
    }
    throw new Error(`sdapi ${endpoint} failed: ${errText}`,);
  }

  const data = (await resp.json()) as { images: string[] };
  return Array.from(data.images, (_b64, i,) => {
    const id = uid();
    return {
      id,
      filename: `sdapi-${id.slice(0, 8,)}-${i}.png`,
      url: `/api/assets/${id}/raw`,
      mimeType: "image/png",
    };
  },);
}

export async function openaiGenerate(
  host: SDServerHost,
  body: Record<string, unknown>,
): Promise<ImageEditResult[]> {
  const url = `${host.baseUrl}/v1/images/generations`;

  const cfg = host.getConfig();
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
    let errText = "unknown";
    try {
      errText = await resp.text();
    } catch {
      // Error body read failed — keep "unknown" fallback
    }
    throw new Error(`OpenAI image gen failed: ${errText}`,);
  }

  const data = (await resp.json()) as { data: { b64_json: string }[] };
  return Array.from(data.data, (_entry, i,) => {
    const id = uid();
    return {
      id,
      filename: `openai-${id.slice(0, 8,)}-${i}.png`,
      url: `/api/assets/${id}/raw`,
      mimeType: "image/png",
    };
  },);
}
