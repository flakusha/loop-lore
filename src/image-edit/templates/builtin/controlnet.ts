// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { WorkflowTemplate, } from "../../types";

export const controlnet: WorkflowTemplate = {
  id: "controlnet",
  name: "ControlNet Guided",
  description: "Generate or transform an image guided by a control image (edge, depth, pose, etc.)",
  category: "controlnet",
  backends: ["comfyui",],
  required_nodes: [
    "KSampler",
    "CheckpointLoaderSimple",
    "EmptyLatentImage",
    "VAEDecode",
    "ControlNetLoader",
    "ControlNetApply",
    "SaveImage",
  ],
  parameters: [
    {
      name: "prompt",
      type: "string",
      label: "Prompt",
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
      name: "control_image",
      type: "image",
      label: "Control Image",
      description: "Edge map, depth map, pose skeleton, etc.",
      required: true,
      default: "",
    },
    {
      name: "controlnet_model",
      type: "select",
      label: "ControlNet Model",
      default: "control_v11p_sd15_canny",
      options: [
        { label: "Canny Edge", value: "control_v11p_sd15_canny", },
        { label: "Depth", value: "control_v11f1p_sd15_depth", },
        { label: "OpenPose", value: "control_v11p_sd15_openpose", },
        { label: "Scribble", value: "control_v11p_sd15_scribble", },
        { label: "SoftEdge", value: "control_v11p_sd15_softedge", },
        { label: "Lineart", value: "control_v11p_sd15_lineart", },
      ],
    },
    {
      name: "controlnet_strength",
      type: "number",
      label: "ControlNet Strength",
      default: 1,
      min: 0,
      max: 2,
      step: 0.1,
    },
    {
      name: "width",
      type: "number",
      label: "Width",
      default: 512,
      min: 64,
      max: 2048,
      step: 64,
    },
    {
      name: "height",
      type: "number",
      label: "Height",
      default: 512,
      min: 64,
      max: 2048,
      step: 64,
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
        inputs: {
          width: (params.width) ?? 512,
          height: (params.height) ?? 512,
          batch_size: 1,
        },
        class_type: "EmptyLatentImage",
        _meta: { title: "Empty Latent Image", },
      },
      "5": {
        inputs: {
          image: (params.control_image) ?? "",
        },
        class_type: "LoadImage",
        _meta: { title: "Load Control Image", },
      },
      "6": {
        inputs: {
          control_net_name: (params.controlnet_model) ?? "control_v11p_sd15_canny",
        },
        class_type: "ControlNetLoader",
        _meta: { title: "Load ControlNet", },
      },
      "7": {
        inputs: {
          strength: (params.controlnet_strength) ?? 1,
          condition: ["2", 0,],
          control_net: ["6", 0,],
          image: ["5", 0,],
        },
        class_type: "ControlNetApply",
        _meta: { title: "Apply ControlNet", },
      },
      "8": {
        inputs: {
          seed: actualSeed,
          steps: (params.steps) ?? 20,
          cfg: (params.cfg_scale) ?? 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0,],
          positive: ["7", 0,],
          negative: ["3", 0,],
          latent_image: ["4", 0,],
        },
        class_type: "KSampler",
        _meta: { title: "KSampler", },
      },
      "9": {
        inputs: { samples: ["8", 0,], vae: ["1", 2,], },
        class_type: "VAEDecode",
        _meta: { title: "VAE Decode", },
      },
      "10": {
        inputs: { filename_prefix: "loop-lore-controlnet", images: ["9", 0,], },
        class_type: "SaveImage",
        _meta: { title: "Save Image", },
      },
    };
  },
};
