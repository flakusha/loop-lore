// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/image-edit/templates/builtin/_helpers.ts
//
// Shared node builders for the workflow templates. Each builtin
// (controlnet, txt2img, img2img, inpaint, lora, upscale) composes the same
// handful of ComfyUI nodes — checkpoint load, CLIPTextEncode, KSampler,
// VAEDecode, SaveImage. Keeping these as builders removes ~150 lines of
// copy/paste across the four templates.

import type { ComfyUIWorkflow, } from "../../../generation/providers/comfyui";

/**
 * Resolve the `seed` parameter, randomising when set to the sentinel `-1`.
 * @param seedParam
 */
export function resolveSeed(seedParam: unknown,): number {
  const seed = (seedParam as number | undefined) ?? -1;
  return seed === -1 ? Math.floor(Math.random() * 2_147_483_647,) : seed;
}

/** Build the CheckpointLoaderSimple node (id "1"). */
export function checkpointNode(): ComfyUIWorkflow {
  return {
    "1": {
      inputs: { checkpoint_name: "model.safetensors", },
      class_type: "CheckpointLoaderSimple",
      _meta: { title: "Load Checkpoint", },
    },
  };
}

/** Build the positive + negative CLIPTextEncode nodes (ids "2" + "3"). */
export function promptNodes(
  params: Record<string, unknown>,
  clipRef: [string, number,] = ["1", 1,],
): ComfyUIWorkflow {
  return {
    "2": {
      inputs: { text: (params.prompt as string) ?? "", clip: clipRef, },
      class_type: "CLIPTextEncode",
      _meta: { title: "Positive Prompt", },
    },
    "3": {
      inputs: { text: (params.negative_prompt as string) ?? "", clip: clipRef, },
      class_type: "CLIPTextEncode",
      _meta: { title: "Negative Prompt", },
    },
  };
}

/** Options for {@link ksamplerNode}. */
export interface KSamplerOptions {
  id?: string;
  positive: [string, number,];
  negative: [string, number,];
  latent: [string, number,];
  model: [string, number,];
  denoise?: number;
  sampler?: string;
  scheduler?: string;
}

/** Build a KSampler node. */
export function ksamplerNode(
  params: Record<string, unknown>,
  seed: number,
  opts: KSamplerOptions,
): ComfyUIWorkflow {
  const id = opts.id ?? "5";
  return {
    [id]: {
      inputs: {
        seed,
        steps: (params.steps as number) ?? 20,
        cfg: (params.cfg_scale as number) ?? 7,
        sampler_name: opts.sampler ?? (params.sampler as string) ?? "euler",
        scheduler: opts.scheduler ?? "normal",
        denoise: opts.denoise ?? 1,
        model: opts.model,
        positive: opts.positive,
        negative: opts.negative,
        latent_image: opts.latent,
      },
      class_type: "KSampler",
      _meta: { title: "KSampler", },
    },
  };
}

/** Build VAEDecode + SaveImage nodes after the sampler. */
export function decodeAndSave(
  samplerId: string,
  vaeRef: [string, number,] = ["1", 2,],
  filenamePrefix = "loop-lore",
): ComfyUIWorkflow {
  const decodeId = String(Number(samplerId,) + 1,);
  const saveId = String(Number(samplerId,) + 2,);
  return {
    [decodeId]: {
      inputs: { samples: [samplerId, 0,], vae: vaeRef, },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode", },
    },
    [saveId]: {
      inputs: { filename_prefix: filenamePrefix, images: [decodeId, 0,], },
      class_type: "SaveImage",
      _meta: { title: "Save Image", },
    },
  };
}

/** Build a LoadImage node. */
export function loadImageNode(
  id: string,
  paramName: string,
  params: Record<string, unknown>,
  title = "Load Image",
): ComfyUIWorkflow {
  return {
    [id]: {
      inputs: { image: (params[paramName] as string) ?? "", },
      class_type: "LoadImage",
      _meta: { title, },
    },
  };
}
