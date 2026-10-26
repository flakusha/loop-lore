// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { runSdServerJob, sdServerAuthHeaders, } from "../../../generation/image-engine/sd-server-jobs";
import { safeFetch, safeJsonStringify, } from "../../../utils";
import type { ImageEditProgress, } from "../../types";
import type { SDServerHost, } from "./types";

/** A generated image straight off the backend wire: base64 payload + mime.
 * Persistence into real asset rows happens in the provider's `execute` —
 * these raw values never become asset URLs on their own. */
export interface SdServerRawImage {
  /** Base64-encoded image bytes. */
  b64: string;
  /** MIME type of the decoded bytes. */
  mimeType: string;
}

/**
 * Generate via the sd.cpp async job API (submit + poll through the shared
 * sd-server transport — one implementation for image-engine and image-edit).
 * @param host
 * @param endpoint
 * @param body
 * @param onProgress
 * @throws {SdServerJobError} on submission failure, repeated failed polls,
 * terminal job status, completion without images, or deadline expiry
 * @returns {Promise<SdServerRawImage[]>}
 */
export async function sdcppGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  onProgress?: (progress: ImageEditProgress,) => void,
): Promise<SdServerRawImage[]> {
  if (!host.baseUrl) { throw new Error("sd-server base URL is not configured",); }

  const cfg = host.getConfig();
  const images = await runSdServerJob({
    baseUrl: host.baseUrl,
    endpoint,
    body,
    headers: sdServerAuthHeaders(cfg?.apiKey,),
    generationTimeoutMs: cfg?.generationTimeout,
    onProgress: onProgress
      ? (progress, message,) => {
        onProgress?.({ status: "running", progress, message, },);
      }
      : undefined,
  },);

  return Array.from(images, (b64,) => ({ b64, mimeType: "image/png", }),);
}

/**
 * Generate via the Stable Diffusion WebUI API (synchronous request).
 * @param host
 * @param endpoint
 * @param body
 * @throws {Error} when the backend call fails
 * @returns {Promise<SdServerRawImage[]>}
 */
export async function sdapiGenerate(
  host: SDServerHost,
  endpoint: string,
  body: Record<string, unknown>,
  _onProgress?: (progress: ImageEditProgress,) => void,
): Promise<SdServerRawImage[]> {
  const url = `${host.baseUrl}/sdapi/v1/${endpoint}`;

  const cfg = host.getConfig();
  const auth = sdServerAuthHeaders(cfg?.apiKey,);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...auth,
  };

  const payload = safeJsonStringify(body,);
  // Base64 image payloads can exceed safeFetch's default size cap.
  const result = await safeFetch<{ images: string[] }>(url, {
    method: "POST",
    headers,
    body: payload.ok ? payload.value : "{}",
    timeout: 120_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!result.ok) {
    throw new Error(`sdapi ${endpoint} failed: ${result.error.message}`,);
  }

  return Array.from(result.data.images, (b64,) => ({ b64, mimeType: "image/png", }),);
}

/**
 * Generate via an OpenAI-compatible images endpoint.
 * @param host
 * @param body
 * @throws {Error} when the backend call fails
 * @returns {Promise<SdServerRawImage[]>}
 */
export async function openaiGenerate(
  host: SDServerHost,
  body: Record<string, unknown>,
): Promise<SdServerRawImage[]> {
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

  return Array.from(result.data.data, (entry,) => ({ b64: entry.b64_json, mimeType: "image/png", }),);
}
