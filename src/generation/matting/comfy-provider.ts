// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — ComfyUI provider.
 *
 * Runs ComfyUI's native background-removal pipeline (core nodes since the
 * upstream BiRefNet support):
 *   LoadImage → LoadBackgroundRemovalModel → RemoveBackground → InvertMask
 *   → JoinImageWithAlpha → SaveImage
 * Requires a recent ComfyUI with those nodes in `/object_info` and the
 * weights file (default `birefnet.safetensors`, MIT upstream) under
 * `models/background_removal/`. Node presence is verified on every call so
 * an outdated ComfyUI degrades to a job failure instead of a broken cut-out.
 */
import { getLogger, } from "../../logger";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import type { ComfyUIClient, ComfyUIWorkflow, } from "../providers/comfyui";
import { looksLikePng, } from "./providers";
import type { MattingProvider, } from "./types";

/** ComfyUI node class_types the matting workflow depends on. */
export const MATTING_REQUIRED_NODES = [
  "LoadImage",
  "LoadBackgroundRemovalModel",
  "RemoveBackground",
  "InvertMask",
  "JoinImageWithAlpha",
  "SaveImage",
] as const;

/** Options for the ComfyUI matting provider. */
export interface ComfyMattingProviderOpts {
  /** Client bound to the ComfyUI instance. */
  client: ComfyUIClient;
  /** `background_removal` weights file name (default `birefnet.safetensors`). */
  model?: string;
}

/**
 * Build the API-format (`/prompt`) matting workflow for an uploaded image.
 * Mirrors the official `utility_birefnet_remove_background` template:
 * subject mask inverted to alpha, then joined back onto the source image.
 * @param imageName - filename in the ComfyUI input directory
 * @param model - background-removal weights file name
 */
export function buildMattingWorkflow(imageName: string, model: string,): ComfyUIWorkflow {
  return {
    "1": { class_type: "LoadImage", inputs: { image: imageName, }, },
    "2": {
      class_type: "LoadBackgroundRemovalModel",
      inputs: { bg_removal_name: model, },
    },
    "3": {
      class_type: "RemoveBackground",
      inputs: { image: ["1", 0,], bg_removal_model: ["2", 0,], },
    },
    "4": { class_type: "InvertMask", inputs: { mask: ["3", 0,], }, },
    "5": {
      class_type: "JoinImageWithAlpha",
      inputs: { image: ["1", 0,], alpha: ["4", 0,], },
    },
    "6": {
      class_type: "SaveImage",
      inputs: { images: ["5", 0,], filename_prefix: "loop-lore-matted", },
    },
  };
}

/**
 * Whether a `/object_info` payload exposes the background-removal nodes.
 * @param info - node-info payload keyed by class_type
 */
export function hasMattingNodes(info: Record<string, unknown>,): boolean {
  return MATTING_REQUIRED_NODES.every((node,) => node in info);
}

/**
 * Create a matting provider executing the native ComfyUI pipeline.
 * @param opts
 */
export function createComfyMattingProvider(opts: ComfyMattingProviderOpts,): MattingProvider {
  const model = opts.model ?? "birefnet.safetensors";
  const { client, } = opts;
  return {
    name: `comfy:${model}`,
    async removeBackground(buffer: Buffer,): Promise<Buffer> {
      const nodes = await client.getNodeInfo();
      if (!hasMattingNodes(nodes,)) {
        getLogger().warn({ event: "matting.comfy_missing_nodes", },);
        throw new Error(
          "ComfyUI is missing the background-removal nodes — update ComfyUI",
        );
      }

      const uploadName = await client.uploadImage(
        buffer,
        `matting-${Date.now()}.png`,
      );
      const outputs = await client.runWorkflow(
        buildMattingWorkflow(uploadName, model,),
      );

      const png = outputs[0];
      if (!png) {
        throw new Error("ComfyUI matting workflow produced no image",);
      }
      const sized = safeFromUint8Array(new Uint8Array(png,),);
      if (!sized.ok) { throw sized.error; }
      if (!looksLikePng(sized.buffer,)) {
        throw new Error("ComfyUI matting returned a non-PNG payload",);
      }
      return sized.buffer;
    },
  };
}
