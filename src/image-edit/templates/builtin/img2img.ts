import type { WorkflowTemplate, } from "../../types";

export const img2img: WorkflowTemplate = {
  id: "img2img",
  name: "Image to Image",
  description: "Transform an existing image guided by a text prompt",
  category: "img2img",
  backends: ["comfyui", "sd-server",],
  required_nodes: ["KSampler", "CheckpointLoaderSimple", "LoadImage", "VAEEncode", "VAEDecode", "SaveImage",],
  parameters: [
    {
      name: "prompt",
      type: "string",
      label: "Prompt",
      description: "Text description guiding the transformation",
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
      description: "Source image to transform",
      default: "",
      required: true,
    },
    {
      name: "denoise_strength",
      type: "number",
      label: "Denoising Strength",
      description: "0.0 = no change, 1.0 = full regeneration",
      default: 0.75,
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
      name: "sampler",
      type: "select",
      label: "Sampler",
      default: "euler",
      options: [
        { label: "Euler", value: "euler", },
        { label: "Euler a", value: "euler_ancestral", },
        { label: "DPM++ 2M", value: "dpmpp_2m", },
        { label: "DPM++ 2M Karras", value: "dpmpp_2m_karras", },
      ],
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
        inputs: { pixels: ["4", 0,], vae: ["1", 2,], },
        class_type: "VAEEncode",
        _meta: { title: "VAE Encode", },
      },
      "6": {
        inputs: {
          seed: actualSeed,
          steps: (params.steps) ?? 20,
          cfg: (params.cfg_scale) ?? 7,
          sampler_name: (params.sampler) ?? "euler",
          scheduler: "normal",
          denoise: (params.denoise_strength) ?? 0.75,
          model: ["1", 0,],
          positive: ["2", 0,],
          negative: ["3", 0,],
          latent_image: ["5", 0,],
        },
        class_type: "KSampler",
        _meta: { title: "KSampler", },
      },
      "7": {
        inputs: { samples: ["6", 0,], vae: ["1", 2,], },
        class_type: "VAEDecode",
        _meta: { title: "VAE Decode", },
      },
      "8": {
        inputs: { filename_prefix: "loop-lore-img2img", images: ["7", 0,], },
        class_type: "SaveImage",
        _meta: { title: "Save Image", },
      },
    };
  },
};
