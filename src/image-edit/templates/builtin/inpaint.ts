// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { WorkflowTemplate, } from "../../types";

export const inpaint: WorkflowTemplate = {
  id: "inpaint",
  name: "Inpainting",
  description: "Fill in a masked region of an image with AI-generated content",
  category: "inpaint",
  backends: ["comfyui", "sd-server",],
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
    {
      name: "negative_prompt",
      type: "string",
      label: "Negative Prompt",
      default: "",
    },
    {
      name: "input_image",
      type: "image",
      label: "Input Image",
      required: true,
      default: "",
    },
    {
      name: "mask_image",
      type: "image",
      label: "Mask Image",
      description: "White = inpaint area, Black = keep",
      required: true,
      default: "",
    },
    {
      name: "denoise_strength",
      type: "number",
      label: "Denoising Strength",
      default: 0.9,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      name: "steps",
      type: "number",
      label: "Steps",
      default: 20,
      min: 1,
      max: 150,
    },
    {
      name: "cfg_scale",
      type: "number",
      label: "CFG Scale",
      default: 7,
      min: 1,
      max: 30,
      step: 0.5,
    },
    {
      name: "seed",
      type: "number",
      label: "Seed",
      default: -1,
      min: -1,
      max: 2_147_483_647,
    },
  ],
  build(params,) {
    const seed = (params.seed as number) ?? -1;
    const actualSeed = seed === -1 ? Math.floor(Math.random() * 2_147_483_647,) : seed;

    return {
      "1": {
        inputs: { checkpoint_name: "model.safetensors", },
        class_type: "CheckpointLoaderSimple",
        _meta: { title: "Load Checkpoint", },
      },
      "2": {
        inputs: { text: (params.prompt) ?? "", clip: ["1", 1,], },
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt", },
      },
      "3": {
        inputs: { text: (params.negative_prompt) ?? "", clip: ["1", 1,], },
        class_type: "CLIPTextEncode",
        _meta: { title: "Negative Prompt", },
      },
      "4": {
        inputs: { image: (params.input_image) ?? "", },
        class_type: "LoadImage",
        _meta: { title: "Load Input Image", },
      },
      "5": {
        inputs: { image: (params.mask_image) ?? "", },
        class_type: "LoadImage",
        _meta: { title: "Load Mask Image", },
      },
      "6": {
        inputs: {
          pixels: ["4", 0,],
          mask: ["5", 1,],
          vae: ["1", 2,],
          grow_mask_by: 6,
        },
        class_type: "VAEEncodeForInpaint",
        _meta: { title: "VAE Encode for Inpaint", },
      },
      "7": {
        inputs: {
          seed: actualSeed,
          steps: (params.steps) ?? 20,
          cfg: (params.cfg_scale) ?? 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: (params.denoise_strength) ?? 0.9,
          model: ["1", 0,],
          positive: ["2", 0,],
          negative: ["3", 0,],
          latent_image: ["6", 0,],
        },
        class_type: "KSampler",
        _meta: { title: "KSampler", },
      },
      "8": {
        inputs: { samples: ["7", 0,], vae: ["1", 2,], },
        class_type: "VAEDecode",
        _meta: { title: "VAE Decode", },
      },
      "9": {
        inputs: { filename_prefix: "loop-lore-inpaint", images: ["8", 0,], },
        class_type: "SaveImage",
        _meta: { title: "Save Image", },
      },
    };
  },
};
