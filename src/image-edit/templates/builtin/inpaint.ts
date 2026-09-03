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

export const inpaint: WorkflowTemplate = {
  id: "inpaint",
  name: "Inpainting",
  description: "Fill in a masked region of an image with AI-generated content",
  category: "inpaint",
  backends: ["comfyui", "sd-server"],
  required_nodes: [
    "KSampler",
    "CheckpointLoaderSimple",
    "LoadImage",
    "VAEEncodeForInpaint",
    "VAEDecode",
    "SaveImage",
  ],
  parameters: [
    {
      name: "prompt",
      type: "string",
      label: "Prompt",
      description: "What to generate in the masked area",
      default: "",
      required: true,
    },
    { name: "negative_prompt", type: "string", label: "Negative Prompt", default: "" },
    { name: "input_image", type: "image", label: "Input Image", required: true, default: "" },
    {
      name: "mask_image",
      type: "image",
      label: "Mask Image",
      description: "White = inpaint area, Black = keep",
      required: true,
      default: "",
    },
    { name: "denoise_strength", type: "number", label: "Denoising Strength", default: 0.9, min: 0, max: 1, step: 0.05 },
    { name: "steps", type: "number", label: "Steps", default: 20, min: 1, max: 150 },
    { name: "cfg_scale", type: "number", label: "CFG Scale", default: 7, min: 1, max: 30, step: 0.5 },
    { name: "seed", type: "number", label: "Seed", default: -1, min: -1, max: 2_147_483_647 },
  ],
  build(params) {
    const seed = resolveSeed(params.seed);
    return {
      ...checkpointNode(),
      ...promptNodes(params),
      ...loadImageNode("4", "input_image", params, "Load Input Image"),
      ...loadImageNode("5", "mask_image", params, "Load Mask Image"),
      "6": {
        inputs: { pixels: ["4", 0], mask: ["5", 1], vae: ["1", 2], grow_mask_by: 6 },
        class_type: "VAEEncodeForInpaint",
        _meta: { title: "VAE Encode for Inpaint" },
      },
      ...ksamplerNode(params, seed, {
        id: "7",
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent: ["6", 0],
        denoise: (params.denoise_strength as number) ?? 0.9,
        sampler: "euler",
      }),
      ...decodeAndSave("7", ["1", 2], "loop-lore-inpaint"),
    };
  },
};
