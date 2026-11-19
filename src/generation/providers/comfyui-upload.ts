// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI input-image upload (split from comfyui.ts for file size).
 * POSTs multipart to `/upload/image` with overwrite and surfaces the
 * stored filename for LoadImage nodes.
 */
import { safeJsonStringify, } from "../../utils";
import { safeFetch, } from "../../utils/safe-fetch";

/**
 * Upload an input image for LoadImage nodes to reference.
 * @param baseUrl - ComfyUI base URL
 * @param timeoutMs - request timeout in ms
 * @param buffer - image bytes
 * @param filename - name the file gets in the ComfyUI input directory
 * @param apiKey - optional Bearer credential for proxy-fronted engines
 * @returns the stored filename (pass to LoadImage's `image` input)
 * @throws {Error}
 * @throws {Error}
 */
export async function uploadImageToComfy(
  baseUrl: string,
  timeoutMs: number,
  buffer: Buffer,
  filename: string,
  apiKey?: string,
): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer,),], { type: "image/png", },), filename,);
  form.append("overwrite", "true",);

  const result = await safeFetch<{ name?: string }>(`${baseUrl}/upload/image`, {
    method: "POST",
    headers: apiKey ? { authorization: `Bearer ${apiKey}`, } : undefined,
    body: form,
    timeout: timeoutMs,
  },);

  if (!result.ok) {
    throw new Error(
      `ComfyUI image upload failed${result.status ? ` [${result.status}]` : ""}: ${result.error.message}`,
    );
  }

  if (!result.data.name) {
    throw new Error("ComfyUI upload returned no filename",);
  }

  return result.data.name;
}

/** Reference to the ComfyUI input file a mask is overlaid onto. */
export interface ComfyUIMaskOriginalRef {
  filename: string;
  type?: string;
  subfolder?: string;
}

/**
 * POST a mask to ComfyUI's `/upload/mask` endpoint. The mask is applied to the
 * alpha channel of `originalRef`, so a mask cannot be uploaded before its
 * target image has been uploaded in the same run.
 * @param baseUrl - ComfyUI base URL
 * @param timeoutMs - request timeout in ms
 * @param buffer - mask image bytes
 * @param filename - name for the stored mask
 * @param originalRef - uploaded input image the mask overlays
 * @param apiKey - optional Bearer credential for proxy-fronted engines
 * @returns the stored filename
 * @throws {Error}
 */
export async function uploadMaskToComfy(
  baseUrl: string,
  timeoutMs: number,
  buffer: Buffer,
  filename: string,
  originalRef: ComfyUIMaskOriginalRef,
  apiKey?: string,
): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer,),], { type: "image/png", },), filename,);
  const encodedRef = safeJsonStringify(originalRef,);
  if (!encodedRef.ok) { throw new Error("ComfyUI mask original_ref could not be serialized",); }
  form.append("original_ref", encodedRef.value,);
  form.append("overwrite", "true",);

  const result = await safeFetch<{ name?: string }>(`${baseUrl}/upload/mask`, {
    method: "POST",
    headers: apiKey ? { authorization: `Bearer ${apiKey}`, } : undefined,
    body: form,
    timeout: timeoutMs,
  },);

  if (!result.ok) {
    throw new Error(
      `ComfyUI mask upload failed${result.status ? ` [${result.status}]` : ""}: ${result.error.message}`,
    );
  }

  if (!result.data.name) {
    throw new Error("ComfyUI mask upload returned no filename",);
  }

  return result.data.name;
}
