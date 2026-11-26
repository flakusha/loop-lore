// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI output-file download (split from comfyui.ts for file size).
 * GETs `/view` with the file reference and enforces the safe buffer limit.
 */
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import { proxyForUrl, safeFetch, } from "../../utils/safe-fetch";
import type { ComfyUIOutputFile, } from "./comfyui";

/** Auth headers for proxy-fronted engines; empty for stock ComfyUI. */
function authHeaders(apiKey: string | undefined,): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}`, } : {};
}

/**
 * Download any ComfyUI output file (image, audio, video) by reference.
 * @param baseUrl - ComfyUI base URL
 * @param file - output file reference from pollResult / waitForFiles
 * @param apiKey - optional Bearer credential for proxy-fronted engines
 * @returns the file bytes
 * @throws {Error} When the view fetch returns a non-OK status.
 * @throws {SafeBufferError} When the bytes exceed the safe buffer limit.
 */
export async function downloadComfyFile(
  baseUrl: string,
  file: ComfyUIOutputFile,
  apiKey?: string,
): Promise<Buffer> {
  const params = new URLSearchParams({ filename: file.filename, type: file.type ?? "output", },);
  if (file.subfolder) { params.set("subfolder", file.subfolder,); }

  const url = `${baseUrl}/view?${params.toString()}`;
  const timeout = AbortSignal.timeout(30_000,);
  const result = await safeFetch<Response>(url, {
    headers: authHeaders(apiKey,),
    signal: timeout,
    stream: true,
    handle401: false,
    proxy: proxyForUrl(url,),
  },);

  if (!result.ok) {
    if (timeout.aborted) { throw new DOMException("Aborted", "AbortError",); }
    if (result.status === undefined) { throw result.error; }
    throw new Error(`ComfyUI view download failed [${result.status}]: ${file.filename}`,);
  }

  const sized = safeFromUint8Array(new Uint8Array(await result.data.arrayBuffer(),),);
  if (!sized.ok) { throw sized.error; }
  return sized.buffer;
}
