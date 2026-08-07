import type { WorkflowTemplate, } from "../../types";

export const upscale: WorkflowTemplate = {
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
