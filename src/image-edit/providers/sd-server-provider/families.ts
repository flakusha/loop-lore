// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFetch, safeJsonStringify, uid, } from "../../../utils";
import type { ImageEditProgress, ImageEditResult, } from "../../types";
import type { SDServerHost, } from "./types";

/**
 * @param host
 * @param endpoint
 * @param body
 * @param onProgress
 */
export async function sdcppGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  const url = `${host.baseUrl}/sdcpp/v1/${endpoint}`;

  const submitPayload = safeJsonStringify(body,);
  // Job status carries base64 images — can exceed safeFetch's default size cap.
  const submitResult = await safeFetch<{ id: string }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: submitPayload.ok ? submitPayload.value : "{}",
    timeout: 30_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!submitResult.ok) {
    throw new Error(`sd.cpp job submission failed: ${submitResult.error.message}`,);
  }

  const { id: jobId, } = submitResult.data;
  if (!jobId) { throw new Error("sd.cpp returned no job id",); }

  onProgress?.({ status: "running", progress: 0.1, message: "Processing...", },);

  // Poll for completion
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const jobUrl = `${host.baseUrl}/sdcpp/v1/jobs/${jobId}`;
    const statusResult = await safeFetch<{
      status: string;
      progress?: number;
      images?: string[];
      error?: string;
    }>(jobUrl, {
      timeout: 10_000,
      maxSize: Number.MAX_SAFE_INTEGER,
      handle401: false,
    },);

    if (!statusResult.ok) {
      throw new Error(`sd.cpp polling failed: ${statusResult.error.message}`,);
    }

    const statusData = statusResult.data;

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

/**
 * @param host
 * @param endpoint
 * @param body
 * @param _onProgress
 */
export async function sdapiGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  _onProgress?: (progress: ImageEditProgress,) => void,
): Promise<ImageEditResult[]> {
  const url = `${host.baseUrl}/sdapi/v1/${endpoint}`;

  const payload = safeJsonStringify(body,);
  // Base64 image payloads can exceed safeFetch's default size cap.
  const result = await safeFetch<{ images: string[] }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: payload.ok ? payload.value : "{}",
    timeout: 120_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!result.ok) {
    throw new Error(`sdapi ${endpoint} failed: ${result.error.message}`,);
  }

  const data = result.data;
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

/**
 * @param host
 * @param body
 */
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

  const result = await safeFetch<{ data: { b64_json: string }[] }>(url, {
    method: "POST",
    headers,
    body: payload.ok ? payload.value : "{}",
    timeout: 60_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!result.ok) {
    throw new Error(`OpenAI image gen failed: ${result.error.message}`,);
  }

  const data = result.data;
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
