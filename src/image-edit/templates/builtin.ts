/**
 * Built-in Workflow Templates — txt2img, img2img, inpaint, upscale, controlnet
 *
 * Each template produces a ComfyUI workflow JSON structure.
 * sd-server templates use the same parameters but are translated
 * at the provider layer to the appropriate API call.
 *
 * @module builtin-templates
 */

import type { ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import type { LoraEntry, WorkflowTemplate, } from "../types";

// ── LORA Helpers ─────────────────────────────────────────────

/** Parse LoRA entries from comma-separated string: "path:strength,path:strength" */
function parseLoraString(loraStr: string,): LoraEntry[] {
  const entries: LoraEntry[] = [];
  if (!loraStr.trim()) { return entries; }

  for (const entry of loraStr.split(",",)) {
    const trimmed = entry.trim();
    if (!trimmed) { continue; }
    const colonIdx = trimmed.lastIndexOf(":",);
    if (colonIdx > 0) {
      const path = trimmed.slice(0, colonIdx,);
      const strength = Number.parseFloat(trimmed.slice(colonIdx + 1,),);
      if (path && !Number.isNaN(strength,)) {
        entries.push({ path, strength, },);
      }
    } else {
      entries.push({ path: trimmed, strength: 1, },);
    }
  }
  return entries;
}

/**
 * Build ComfyUI LORA nodes from a list of LoraEntry objects.
 * Returns workflow nodes and the final model/clip output refs
 * after all LORAs have been applied.
 */
function buildLoraNodes(
  loras: LoraEntry[],
  startModelRef: [string, number,],
  startClipRef: [string, number,],
): { nodes: ComfyUIWorkflow; modelRef: [string, number,]; clipRef: [string, number,] } {
  const nodes: ComfyUIWorkflow = {};
  let currentModel = startModelRef;
  let currentClip = startClipRef;
  let nodeIndex = 100; // Start LORA nodes at 100 to avoid collisions

  for (const lora of loras) {
    const id = String(nodeIndex,);
    nodes[id] = {
      inputs: {
        lora_name: lora.path,
        strength_model: lora.strength,
        strength_clip: lora.strength,
        model: currentModel,
        clip: currentClip,
      },
      class_type: "LoraLoader",
      _meta: { title: `LoRA: ${lora.path}`, },
    };
    currentModel = [id, 0,];
    currentClip = [id, 1,];
    nodeIndex++;
  }

  return { nodes, modelRef: currentModel, clipRef: currentClip, };
}

// ── txt2img ──────────────────────────────────────────────────

const txt2img: WorkflowTemplate = {
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
    const seed = (params.seed as number) ?? -1;
    const actualSeed = seed === -1 ? Math.floor(Math.random() * 2_147_483_647,) : seed;
    const loras = parseLoraString((params.loras as string) ?? "",);

    // Base workflow nodes — checkpoint + latent only
    const baseNodes: ComfyUIWorkflow = {
      "1": {
        inputs: { checkpoint_name: "model.safetensors", },
        class_type: "CheckpointLoaderSimple",
        _meta: { title: "Load Checkpoint", },
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
    };

    // Apply LORAs if present — chain model/clip through LORA nodes
    let modelRef: [string, number,] = ["1", 0,];
    let clipRef: [string, number,] = ["1", 1,];
    let loraNodes: ComfyUIWorkflow = {};

    if (loras.length > 0) {
      const result = buildLoraNodes(loras, modelRef, clipRef,);
      loraNodes = result.nodes;
      modelRef = result.modelRef;
      clipRef = result.clipRef;
    }

    // CLIP text encode + KSampler + decode + save — uses modelRef/clipRef
    const outputNodes: ComfyUIWorkflow = {
      "2": {
        inputs: { text: (params.prompt) ?? "", clip: clipRef, },
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt", },
      },
      "3": {
        inputs: { text: (params.negative_prompt) ?? "", clip: clipRef, },
        class_type: "CLIPTextEncode",
        _meta: { title: "Negative Prompt", },
      },
      "5": {
        inputs: {
          seed: actualSeed,
          steps: (params.steps) ?? 20,
          cfg: (params.cfg_scale) ?? 7,
          sampler_name: (params.sampler) ?? "euler",
          scheduler: "normal",
          denoise: 1,
          model: modelRef,
          positive: ["2", 0,],
          negative: ["3", 0,],
          latent_image: ["4", 0,],
        },
        class_type: "KSampler",
        _meta: { title: "KSampler", },
      },
      "6": {
        inputs: { samples: ["5", 0,], vae: ["1", 2,], },
        class_type: "VAEDecode",
        _meta: { title: "VAE Decode", },
      },
      "7": {
        inputs: { filename_prefix: "loop-lore", images: ["6", 0,], },
        class_type: "SaveImage",
        _meta: { title: "Save Image", },
      },
    };

    return { ...baseNodes, ...loraNodes, ...outputNodes, };
  },
};

// ── img2img ──────────────────────────────────────────────────

const img2img: WorkflowTemplate = {
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

// ── inpaint ──────────────────────────────────────────────────

const inpaint: WorkflowTemplate = {
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

// ── upscale ──────────────────────────────────────────────────

const upscale: WorkflowTemplate = {
  id: "upscale",
  name: "Upscale Image",
  description: "Enhance image resolution using an upscale model",
  category: "upscale",
  backends: ["comfyui", "sd-server",],
  required_nodes: ["LoadImage", "UpscaleModelLoader", "ImageUpscaleWithModel", "SaveImage",],
  parameters: [
    {
      name: "input_image",
      type: "image",
      label: "Input Image",
      required: true,
      default: "",
    },
    {
      name: "upscale_model",
      type: "select",
      label: "Upscale Model",
      default: "RealESRGAN_x4plus",
      options: [
        { label: "RealESRGAN x4+", value: "RealESRGAN_x4plus", },
        { label: "RealESRGAN x4+ Anime", value: "RealESRGAN_x4plus_anime_6B", },
        { label: "RealESRGAN x2", value: "RealESRGAN_x2", },
        { label: "4x-UltraSharp", value: "4x-UltraSharp", },
      ],
    },
  ],
  build(params,) {
    return {
      "1": {
        inputs: { image: (params.input_image) ?? "", },
        class_type: "LoadImage",
        _meta: { title: "Load Image", },
      },
      "2": {
        inputs: { model_name: (params.upscale_model) ?? "RealESRGAN_x4plus", },
        class_type: "UpscaleModelLoader",
        _meta: { title: "Load Upscale Model", },
      },
      "3": {
        inputs: { upscale_model: ["2", 0,], image: ["1", 0,], },
        class_type: "ImageUpscaleWithModel",
        _meta: { title: "Upscale Image", },
      },
      "4": {
        inputs: { filename_prefix: "loop-lore-upscaled", images: ["3", 0,], },
        class_type: "SaveImage",
        _meta: { title: "Save Image", },
      },
    };
  },
};

// ── controlnet ───────────────────────────────────────────────

const controlnet: WorkflowTemplate = {
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

// ── Export all built-in templates ────────────────────────────

export const builtinTemplates: WorkflowTemplate[] = [
  txt2img,
  img2img,
  inpaint,
  upscale,
  controlnet,
];
