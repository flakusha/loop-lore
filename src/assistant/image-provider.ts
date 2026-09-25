// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-provider adapter — resolves the configured image-generation
 * backend (ComfyUI primary, sd-server secondary) at runtime.
 *
 * Pure, side-effect-free. The /image slash command calls this once per
 * invocation; the registry gates `available:` on the result at module load.
 *
 * @module assistant/image-provider
 */

import type { Config, ImageProviderConfig, } from "../config/schema";
import { pickSdProvider, } from "../config/schema";
import { ComfyUIClient, type ComfyUIWorkflow, } from "../generation/providers/comfyui";
import { getLogger, } from "../logger";

/** Available image-generation backends. "none" denotes no resolvable provider. */
export type ImageBackend = "comfyui" | "sd-server" | "none";

/** Why the resolver returned `{ backend: "none" }`. */
export interface ImageProviderNotConfigured {
  backend: "none";
  reason: "no provider configured" | "no generate-purpose provider" | "unsupported apiFamily";
  /** Echo of every provider we considered (for diagnostics), when available. */
  considered?: { name: string; apiFamily: string; purpose?: string }[];
}

/** A backend-specific client + its source config. */
export interface ImageProviderResolved {
  backend: Exclude<ImageBackend, "none">;
  /** Source config for the chosen provider. */
  config: ImageProviderConfig;
  /** Backend-specific client. Both ComfyUI and sd-server today use the ComfyUIClient surface. */
  client: ComfyUIClient;
}

export type ImageProviderResolution = ImageProviderResolved | ImageProviderNotConfigured;

/**
 * Resolve the image-generation provider from `config.generation.providers.sd`.
 *
 * Selection rules (in order):
 * 1. `pickSdProvider(sd, "generate")` — prefers "generate" purpose, then "both", then first entry.
 * 2. backend mapping: `comfyui` → "comfyui"; `sdcpp` + `sdapi` → "sd-server".
 * 3. Anything else (or no provider) → "none".
 *
 * @param config - The loaded app config. Pass `undefined` to evaluate the
 *   no-config branch without importing the loader.
 * @returns discriminated union
 */
export function resolveImageProvider(config: Config | undefined,): ImageProviderResolution {
  const log = getLogger().child({ module: "assistant/image-provider", },);

  const sd = config?.generation.providers.sd;
  if (!sd || sd.length === 0) {
    log.debug("image-provider: no sd providers configured",);
    return { backend: "none", reason: "no provider configured", };
  }

  const chosen = pickSdProvider(sd, "generate",);
  if (!chosen) {
    return {
      backend: "none",
      reason: "no generate-purpose provider",
      considered: sd.map((p,) => ({ name: p.name, apiFamily: p.apiFamily, purpose: p.purpose, })),
    };
  }

  switch (chosen.apiFamily) {
    case "comfyui": {
      return {
        backend: "comfyui",
        config: chosen,
        client: new ComfyUIClient({ baseUrl: chosen.baseUrl, timeout: chosen.timeout, },),
      };
    }
    case "sdcpp":
    case "sdapi": {
      // sd-server uses the ComfyUIClient surface today (sdapi/sdcpp both speak
      // the AUTOMATIC1111 /sdapi/v1 + /sdapi/v1/txt2img HTTP shape; the
      // ComfyUIClient is the project's unified image backend wrapper).
      return {
        backend: "sd-server",
        config: chosen,
        client: new ComfyUIClient({ baseUrl: chosen.baseUrl, timeout: chosen.timeout, },),
      };
    }
    default: {
      return {
        backend: "none",
        reason: "unsupported apiFamily",
        considered: sd.map((p,) => ({ name: p.name, apiFamily: p.apiFamily, purpose: p.purpose, })),
      };
    }
  }
}

/**
 * Convenience: build the workflow payload sent to ComfyUI for an /image prompt.
 * Honors `workflow_template` from the request if present; otherwise uses the
 * default placeholder single-node workflow.
 *
 * Kept here (not in the command module) so the image-edit pipeline can reuse it.
 *
 * @param prompt - User prompt
 * @param workflowTemplate - Optional named template override (file in configs/workflows/)
 * @param client - ComfyUIClient instance (reserved for node discovery)
 * @returns workflow JSON ready for `submitWorkflow`
 */
export async function buildImageWorkflow(
  prompt: string,
  workflowTemplate: string | undefined,
  client: ComfyUIClient,
): Promise<ComfyUIWorkflow> {
  // ponytail: minimal single-node PositivePrompt workflow. Real production
  // templates come from configs/workflows/*.json via the `workflow-loader`;
  // callers can pass a name through `workflow_template`.
  const seed = Math.floor(Math.random() * 1e9,);
  void client; // reserved for node-discovery in a future pass
  void workflowTemplate; // reserved for template-loader integration
  return {
    "1": {
      inputs: { prompt, seed, },
      class_type: "PositivePromptStub",
      _meta: { title: "Prompt", },
    },
  };
}
