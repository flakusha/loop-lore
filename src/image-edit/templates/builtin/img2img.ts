// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { WorkflowTemplate, } from "../../types";
import {
  checkpointNode,
  decodeAndSave,
  ksamplerNode,
  loadImageNode,
  promptNodes,
  resolveSeed,
} from "./_helpers";

export const img2img: WorkflowTemplate = {
  id: "img2img",
  name: "Image to Image",
  description: "Transform an existing image guided by a text prompt",
  category: "img2img",
  backends: ["comfyui", "sd-server"],
  required_nodes: ["KSampler", "CheckpointLoaderSimple", "LoadImage", "VAEEncode", "VAEDecode", "SaveImage"],
  parameters: [
    { name: "prompt", type: "string", label: "Prompt", default: "", required: true },
    { name: "negative_prompt", type: "string", label: "Negative Prompt", default: "" },
    { name: "input_image", type: "image", label: "Input Image", required: true, default: "" },
    { name: "width", type: "number", label: "Width", default: 512, min: 64, max: 2048, step: 64 },
    { name: "height", type: "number", label: "Height", default: 512, min: 64, max: 2048, step: 64 },
    { name: "steps", type: "number", label: "Steps", default: 20, min: 1, max: 150 },
    { name: "cfg_scale", type: "number", label: "CFG Scale", default: 7, min: 1, max: 30, step: 0.5 },
    { name: "sampler", type: "string", label: "Sampler", default: "euler" },
    { name: "denoise_strength", type: "number", label: "Denoise Strength", default: 0.75, min: 0, max: 1, step: 0.05 },
    { name: "seed", type: "number", label: "Seed", default: -1, min: -1, max: 2_147_483_647 },
  ],
  build(params) {
    const seed = resolveSeed(params.seed);
    return {
      ...checkpointNode(),
      ...promptNodes(params),
      ...loadImageNode("4", "input_image", params, "Load Input Image"),
      "5": {
        inputs: { pixels: ["4", 0], vae: ["1", 2] },
        class_type: "VAEEncode",
        _meta: { title: "VAE Encode" },
      },
      ...ksamplerNode(params, seed, {
        id: "6",
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent: ["5", 0],
        denoise: (params.denoise_strength as number) ?? 0.75,
        sampler: (params.sampler as string) ?? "euler",
      }),
      ...decodeAndSave("6", ["1", 2], "loop-lore-img2img"),
    };
  },
};
