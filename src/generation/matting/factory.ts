// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — provider factory.
 *
 * Resolves a `MattingProvider` from the `generation.matting` config section.
 * Pure construction only — no network probes here. ComfyUI node capability
 * is verified lazily on first matting call (`hasMattingNodes`), so an
 * outdated ComfyUI degrades to a failed job, never to a broken cut-out.
 */
import type { Config, MattingConfig, } from "../../config/schema";
import { pickSdProvider, } from "../../config/schema";
import { ImageApiFamily, } from "../../db/enums";
import { ComfyUIClient, } from "../providers/comfyui";
import { createComfyMattingProvider, } from "./comfy-provider";
import { createHttpMattingProvider, createRembgMattingProvider, } from "./providers";
import type { MattingProvider, } from "./types";

/**
 * Pick the comfyui-family SD provider to execute matting with.
 * @param config - server config
 * @returns client factory inputs, or null when no comfy provider is set
 */
function resolveComfyClient(config: Config,): ComfyUIClient | null {
  const comfyProviders = (config.generation.providers.sd ?? []).filter(
    (provider,) => provider.apiFamily === ImageApiFamily.Comfyui,
  );
  const provider = pickSdProvider(comfyProviders, "edit",);
  if (!provider) { return null; }
  return new ComfyUIClient({
    baseUrl: provider.baseUrl,
    timeout: provider.generationTimeout,
    pollIntervalMs: 500,
  },);
}

/**
 * Resolve a matting provider for one backend choice.
 * @param backend - explicit backend selection
 * @param matting - the matting config section
 * @param config - full server config (comfy provider lookup)
 */
function pickBackend(
  backend: MattingConfig["backend"],
  matting: MattingConfig,
  config: Config,
): MattingProvider | null {
  switch (backend) {
    case "http":
      return matting.endpoint
        ? createHttpMattingProvider({
          name: "http",
          endpoint: matting.endpoint,
          apiKey: matting.apiKey,
          timeoutMs: matting.timeoutMs,
        },)
        : null;
    case "rembg":
      return matting.endpoint
        ? createRembgMattingProvider({
          baseUrl: matting.endpoint,
          model: matting.model,
          decontaminate: matting.decontaminate,
          timeoutMs: matting.timeoutMs,
        },)
        : null;
    case "comfy": {
      const client = resolveComfyClient(config,);
      return client
        ? createComfyMattingProvider({ client, model: matting.model, },)
        : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve the configured matting provider.
 * Section absent or `backend: "none"` → null (matting disabled; raw assets
 * stay usable). `backend: "auto"` prefers comfy (when an sd provider with
 * apiFamily "comfyui" is configured), then the rembg sidecar, then the
 * generic HTTP endpoint.
 * @param config - server config
 */
export function resolveMattingProvider(config: Config,): MattingProvider | null {
  const matting = config.generation.matting;
  if (!matting || matting.backend === "none") { return null; }

  if (matting.backend === "auto") {
    return (
      pickBackend("comfy", matting, config,) ??
        // rembg shares `endpoint` with the generic http provider; a bare
        // endpoint is treated as http unless a rembg model is pinned.
        (matting.model ? pickBackend("rembg", matting, config,) : null) ??
        pickBackend("http", matting, config,)
    );
  }
  return pickBackend(matting.backend, matting, config,);
}
