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
import type { MattingProvider, MattingProviderConfig, } from "./types";

/**
 * Create a matting provider from endpoint configuration.
 * @param config
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

      const payload = Buffer.from(await response.arrayBuffer(),);
      if (!looksLikePng(payload,)) {
        throw new Error("Matting provider returned a non-PNG payload",);
      }
      return payload;
    },
  };
}

/**
 * Cheap PNG signature check.
 * @param buffer
 */
function looksLikePng(buffer: Buffer,): boolean {
  if (buffer.length < 8) { return false; }
  return buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;
}
