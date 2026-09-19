// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — HTTP background-removal provider.
 *
 * Posts the source image to a configured endpoint and expects PNG bytes
 * (RGBA cut-out) back. Pluggable: any rembg-class HTTP model or provider
 * endpoint conforms by returning the matted image.
 */
import { getLogger, } from "../../logger";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import type { MattingProvider, MattingProviderConfig, } from "./types";

/**
 * Create a matting provider from endpoint configuration.
 * @param config - endpoint, name, apiKey, timeout
 * @returns the HTTP matting provider
 */
export function createHttpMattingProvider(config: MattingProviderConfig,): MattingProvider {
  return {
    name: config.name,
    async removeBackground(buffer: Buffer,): Promise<Buffer> {
      const timeoutMs = config.timeoutMs ?? 120_000;
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}`, } : {}),
        },
        body: new Uint8Array(buffer,),
        signal: AbortSignal.timeout(timeoutMs,),
      },);

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        getLogger().warn({
          event: "matting.provider_http_error",
          status: response.status,
          detail: detail.slice(0, 200,),
        },);
        throw new Error(`Matting provider returned HTTP ${response.status}`,);
      }

      const raw = new Uint8Array(await response.arrayBuffer(),);
      const sized = safeFromUint8Array(raw,);
      if (!sized.ok) { throw sized.error; }
      const payload = sized.buffer;
      if (!looksLikePng(payload,)) {
        throw new Error("Matting provider returned a non-PNG payload",);
      }
      return payload;
    },
  };
}

/**
 * Cheap PNG signature check.
 * @param buffer - candidate bytes
 * @returns true when the buffer starts with the PNG magic bytes
 */
export function looksLikePng(buffer: Buffer,): boolean {
  if (buffer.length < 8) { return false; }
  return buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;
}

/** Configuration for the rembg HTTP sidecar (`rembg s`). */
export interface RembgMattingProviderConfig {
  /** rembg server base URL, e.g. `http://127.0.0.1:7000` (no `/api/remove`). */
  baseUrl: string;
  /**
   * Model name sent per-request. Defaults to `isnet-general-use`; rembg's
   * own server default (`bria-rmbg`) and the `RMBG-*` weights are
   * non-commercial — pin a permissively licensed model.
   */
  model?: string;
  /** Request edge color decontamination (default true). */
  decontaminate?: boolean;
  /** Request timeout in milliseconds (default 120_000). */
  timeoutMs?: number;
}

/**
 * Create a matting provider for a rembg HTTP server (`rembg s`).
 *
 * Posts the source image as multipart form data to `<baseUrl>/api/remove`
 * with `model` and `dc` form fields (verified against rembg's FastAPI
 * server contract) and expects PNG bytes back.
 * @param config - rembg baseUrl, model, decontamination, timeout
 * @returns the rembg matting provider
 */
export function createRembgMattingProvider(config: RembgMattingProviderConfig,): MattingProvider {
  const model = config.model ?? "isnet-general-use";
  const decontaminate = config.decontaminate ?? true;
  const timeoutMs = config.timeoutMs ?? 120_000;
  return {
    name: `rembg:${model}`,
    async removeBackground(buffer: Buffer,): Promise<Buffer> {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(buffer,),], { type: "application/octet-stream", },),
        "image.png",
      );
      form.append("model", model,);
      form.append("dc", decontaminate ? "true" : "false",);

      const response = await fetch(new URL("/api/remove", config.baseUrl,), {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs,),
      },);

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        getLogger().warn({
          event: "matting.rembg_http_error",
          status: response.status,
          detail: detail.slice(0, 200,),
        },);
        throw new Error(`rembg returned HTTP ${response.status}`,);
      }

      const raw = new Uint8Array(await response.arrayBuffer(),);
      const sized = safeFromUint8Array(raw,);
      if (!sized.ok) { throw sized.error; }
      if (!looksLikePng(sized.buffer,)) {
        throw new Error("rembg returned a non-PNG payload",);
      }
      return sized.buffer;
    },
  };
}
