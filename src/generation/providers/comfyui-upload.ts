// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI input-image upload (split from comfyui.ts for file size).
 * POSTs multipart to `/upload/image` with overwrite and surfaces the
 * stored filename for LoadImage nodes.
 */
import { safeFetch, } from "../../utils/safe-fetch";

/**
 * Upload an input image for LoadImage nodes to reference.
 * @param baseUrl - ComfyUI base URL
 * @param timeoutMs - request timeout in ms
 * @param buffer - image bytes
 * @param filename - name the file gets in the ComfyUI input directory
 * @returns the stored filename (pass to LoadImage's `image` input)
 */
export async function uploadImageToComfy(
  baseUrl: string,
  timeoutMs: number,
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer,),], { type: "image/png", },), filename,);
  form.append("overwrite", "true",);

  const result = await safeFetch<{ name?: string }>(`${baseUrl}/upload/image`, {
    method: "POST",
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
