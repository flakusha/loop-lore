// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ComfyUIWorkflow, } from "../../../generation/providers/comfyui";
import type { WorkflowTemplate, } from "../../types";
import { decodeAndSave, ksamplerNode, resolveSeed, } from "./_helpers";
import { buildLoraNodes, parseLoraString, } from "./lora";

export const txt2img: WorkflowTemplate = {
  id: "txt2img",
  name: "Text to Image",
  description: "Generate an image from a text prompt",
  category: "txt2img",
  backends: ["comfyui", "sd-server",],
  required_nodes: ["KSampler", "CheckpointLoaderSimple", "EmptyLatentImage", "VAEDecode", "SaveImage",],
  parameters: [
    {
      name: "prompt",
      type: "string",
      label: "Prompt",
      description: "Text description of the image to generate",
      default: "",
      required: true,
    },
    {
      name: "negative_prompt",
      type: "string",
      label: "Negative Prompt",
      description: "Things to avoid in the generated image",
      default: "",
    },
    { name: "width", type: "number", label: "Width", default: 512, min: 64, max: 2048, step: 64, },
    { name: "height", type: "number", label: "Height", default: 512, min: 64, max: 2048, step: 64, },
    { name: "steps", type: "number", label: "Steps", default: 20, min: 1, max: 150, },
    { name: "cfg_scale", type: "number", label: "CFG Scale", default: 7, min: 1, max: 30, step: 0.5, },
    {
      name: "sampler",
      type: "select",
      label: "Sampler",
      default: "euler",
      options: [
        { label: "Euler", value: "euler", },
        { label: "Euler a", value: "euler_ancestral", },
        { label: "DPM++ 2M", value: "dpmpp_2m", },
        { label: "DPM++ 2M Karras", value: "dpmpp_2m_karras", },
        { label: "DDIM", value: "ddim", },
        { label: "LMS", value: "lms", },
      ],
    },
    {
      name: "seed",
      type: "number",
      label: "Seed",
      default: -1,
      min: -1,
      max: 2_147_483_647,
      description: "-1 for random",
    },
    {
      name: "loras",
      type: "string",
      label: "LoRAs",
      description: "Comma-separated LoRA entries: path:strength,... (e.g. detail_enhancer:0.8,style_cartoon:0.6)",
      default: "",
    },
  ],
  build(params,) {
    const actualSeed = resolveSeed(params.seed,);
    const loras = parseLoraString((params.loras as string) ?? "",);

    const baseNodes: ComfyUIWorkflow = {
      "1": {
        inputs: { checkpoint_name: "model.safetensors", },
        class_type: "CheckpointLoaderSimple",
        _meta: { title: "Load Checkpoint", },
      },
      "4": {
        inputs: {
          width: (params.width as number) ?? 512,
          height: (params.height as number) ?? 512,
          batch_size: 1,
        },
        class_type: "EmptyLatentImage",
        _meta: { title: "Empty Latent Image", },
      },
    };

    let modelRef: [string, number,] = ["1", 0,];
    let clipRef: [string, number,] = ["1", 1,];
    let loraNodes: ComfyUIWorkflow = {};

    if (loras.length > 0) {
      const result = buildLoraNodes(loras, modelRef, clipRef,);
      loraNodes = result.nodes;
      modelRef = result.modelRef;
      clipRef = result.clipRef;
    }

    const promptNodes: ComfyUIWorkflow = {
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

    const samplerNodes = ksamplerNode(params, actualSeed, {
      id: "5",
      model: modelRef,
      positive: ["2", 0,],
      negative: ["3", 0,],
      latent: ["4", 0,],
      denoise: 1,
      sampler: (params.sampler as string) ?? "euler",
    },);

    return {
      ...baseNodes,
      ...loraNodes,
      ...promptNodes,
      ...samplerNodes,
      ...decodeAndSave("5", ["1", 2,], "loop-lore",),
    };
  },
};
