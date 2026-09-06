// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { controlnet, } from "./controlnet";
import { img2img, } from "./img2img";
import { inpaint, } from "./inpaint";
import { buildLoraNodes, parseLoraString, } from "./lora";
import { txt2img, } from "./txt2img";
import { upscale, } from "./upscale";

describe("builtin workflow template metadata", () => {
  test("template ids, categories, and backends are set", () => {
    expect(txt2img.id,).toBe("txt2img",);
    expect(img2img.id,).toBe("img2img",);
    expect(inpaint.id,).toBe("inpaint",);
    expect(controlnet.id,).toBe("controlnet",);
    expect(upscale.id,).toBe("upscale",);
    expect(txt2img.backends,).toContain("comfyui",);
    expect(img2img.backends,).toContain("sd-server",);
    expect(controlnet.required_nodes,).toContain("ControlNetApply",);
    expect(upscale.required_nodes,).toContain("ImageUpscaleWithModel",);
  });
});

describe("parseLoraString", () => {
  test("empty and blank strings yield no entries", () => {
    expect(parseLoraString("",),).toEqual([],);
    expect(parseLoraString("   ",),).toEqual([],);
  });

  test("bare path defaults to strength 1", () => {
    expect(parseLoraString("detail_enhancer",),).toEqual([
      { path: "detail_enhancer", strength: 1, },
    ],);
  });

  test("parses path:strength pairs", () => {
    expect(parseLoraString("detail:0.8,style:0.6",),).toEqual([
      { path: "detail", strength: 0.8, },
      { path: "style", strength: 0.6, },
    ],);
  });

  test("skips empty segments and unparseable strengths", () => {
    expect(parseLoraString("good:0.5,,bad:xyz, plain ",),).toEqual([
      { path: "good", strength: 0.5, },
      { path: "plain", strength: 1, },
    ],);
  });

  test("splits on the last colon so Windows paths survive", () => {
    const entries = parseLoraString("C:\\loras\\detail:0.7",);
    expect(entries,).toEqual([{ path: "C:\\loras\\detail", strength: 0.7, },],);
  });
});

describe("buildLoraNodes", () => {
  test("empty list returns no nodes and unchanged refs", () => {
    const result = buildLoraNodes([], ["1", 0,], ["1", 1,],);
    expect(result.nodes,).toEqual({},);
    expect(result.modelRef,).toEqual(["1", 0,],);
    expect(result.clipRef,).toEqual(["1", 1,],);
  });

  test("single lora chains model and clip refs through node 100", () => {
    const result = buildLoraNodes(
      [{ path: "detail", strength: 0.8, },],
      ["1", 0,],
      ["1", 1,],
    );
    expect(result.nodes["100"].class_type,).toBe("LoraLoader",);
    expect(result.nodes["100"].inputs["lora_name"],).toBe("detail",);
    expect(result.nodes["100"].inputs["strength_model"],).toBe(0.8,);
    expect(result.nodes["100"].inputs["model"],).toEqual(["1", 0,],);
    expect(result.nodes["100"].inputs["clip"],).toEqual(["1", 1,],);
    expect(result.modelRef,).toEqual(["100", 0,],);
    expect(result.clipRef,).toEqual(["100", 1,],);
  });

  test("multiple loras chain sequentially from node 100", () => {
    const result = buildLoraNodes(
      [
        { path: "first", strength: 0.8, },
        { path: "second", strength: 0.6, },
      ],
      ["1", 0,],
      ["1", 1,],
    );
    expect(Object.keys(result.nodes,).toSorted(),).toEqual(["100", "101",],);
    expect(result.nodes["101"].inputs["model"],).toEqual(["100", 0,],);
    expect(result.nodes["101"].inputs["clip"],).toEqual(["100", 1,],);
    expect(result.modelRef,).toEqual(["101", 0,],);
    expect(result.clipRef,).toEqual(["101", 1,],);
  });
});

describe("txt2img build", () => {
  test("wires prompt, dimensions, sampler, and seed", () => {
    const wf = txt2img.build({
      prompt: "a castle",
      negative_prompt: "blurry",
      width: 768,
      height: 512,
      steps: 25,
      cfg_scale: 8,
      sampler: "dpmpp_2m",
      seed: 42,
      loras: "",
    },);
    expect(wf["1"].class_type,).toBe("CheckpointLoaderSimple",);
    expect(wf["2"].inputs["text"],).toBe("a castle",);
    expect(wf["3"].inputs["text"],).toBe("blurry",);
    expect(wf["4"].inputs["width"],).toBe(768,);
    expect(wf["4"].inputs["height"],).toBe(512,);
    expect(wf["5"].class_type,).toBe("KSampler",);
    expect(wf["5"].inputs["seed"],).toBe(42,);
    expect(wf["5"].inputs["steps"],).toBe(25,);
    expect(wf["5"].inputs["sampler_name"],).toBe("dpmpp_2m",);
    expect(wf["5"].inputs["denoise"],).toBe(1,);
    expect(wf["6"].class_type,).toBe("VAEDecode",);
    expect(wf["7"].class_type,).toBe("SaveImage",);
    expect(wf["7"].inputs["filename_prefix"],).toBe("loop-lore",);
  });

  test("loras string inserts LoraLoader nodes and rewires clip", () => {
    const wf = txt2img.build({
      prompt: "a castle",
      negative_prompt: "",
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7,
      sampler: "euler",
      seed: 1,
      loras: "detail:0.8",
    },);
    expect(wf["100"].class_type,).toBe("LoraLoader",);
    expect(wf["2"].inputs["clip"],).toEqual(["100", 1,],);
    expect(wf["5"].inputs["model"],).toEqual(["100", 0,],);
  });

  test("missing optionals fall back to defaults", () => {
    const wf = txt2img.build({ prompt: "x", },);
    expect(wf["4"].inputs["width"],).toBe(512,);
    expect(wf["5"].inputs["sampler_name"],).toBe("euler",);
    expect(wf["2"].inputs["text"],).toBe("x",);
    expect(wf["3"].inputs["text"],).toBe("",);
  });
});

describe("img2img build", () => {
  test("encodes the input image and applies denoise strength", () => {
    const wf = img2img.build({
      prompt: "remix",
      negative_prompt: "",
      input_image: "in.png",
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7,
      sampler: "ddim",
      denoise_strength: 0.5,
      seed: 7,
    },);
    expect(wf["4"].class_type,).toBe("LoadImage",);
    expect(wf["4"].inputs["image"],).toBe("in.png",);
    expect(wf["5"].class_type,).toBe("VAEEncode",);
    expect(wf["5"].inputs["pixels"],).toEqual(["4", 0,],);
    expect(wf["6"].inputs["denoise"],).toBe(0.5,);
    expect(wf["6"].inputs["sampler_name"],).toBe("ddim",);
    expect(wf["6"].inputs["seed"],).toBe(7,);
    expect(wf["6"].inputs["latent_image"],).toEqual(["5", 0,],);
  });

  test("denoise strength defaults to 0.75", () => {
    const wf = img2img.build({ prompt: "x", input_image: "a.png", seed: 3, },);
    expect(wf["6"].inputs["denoise"],).toBe(0.75,);
  });
});

describe("inpaint build", () => {
  test("wires input and mask images into VAEEncodeForInpaint", () => {
    const wf = inpaint.build({
      prompt: "fill",
      negative_prompt: "",
      input_image: "face.png",
      mask_image: "mask.png",
      denoise_strength: 0.6,
      steps: 20,
      cfg_scale: 7,
      seed: 9,
    },);
    expect(wf["4"].inputs["image"],).toBe("face.png",);
    expect(wf["5"].inputs["image"],).toBe("mask.png",);
    expect(wf["7"].inputs["denoise"],).toBe(0.6,);
    expect(wf["7"].inputs["latent_image"],).toEqual(["6", 0,],);
  });

  test("denoise strength defaults to 0.9", () => {
    const wf = inpaint.build({
      prompt: "x",
      input_image: "a.png",
      mask_image: "m.png",
      seed: 2,
    },);
    expect(wf["7"].inputs["denoise"],).toBe(0.9,);
  });
});

describe("controlnet build", () => {
  test("wires control image, model, and strength", () => {
    const wf = controlnet.build({
      prompt: "pose",
      negative_prompt: "",
      control_image: "edge.png",
      controlnet_model: "control_v11f1p_sd15_depth",
      controlnet_strength: 1.5,
      width: 640,
      height: 480,
      steps: 20,
      cfg_scale: 7,
      seed: 11,
    },);
    expect(wf["5"].class_type,).toBe("LoadImage",);
    expect(wf["5"].inputs["image"],).toBe("edge.png",);
    expect(wf["6"].class_type,).toBe("ControlNetLoader",);
    expect(wf["6"].inputs["control_net_name"],).toBe("control_v11f1p_sd15_depth",);
    expect(wf["7"].class_type,).toBe("ControlNetApply",);
    expect(wf["7"].inputs["strength"],).toBe(1.5,);
    expect(wf["7"].inputs["image"],).toEqual(["5", 0,],);
    expect(wf["8"].class_type,).toBe("KSampler",);
    expect(wf["8"].inputs["positive"],).toEqual(["7", 0,],);
    expect(wf["4"].inputs["width"],).toBe(640,);
    expect(wf["4"].inputs["height"],).toBe(480,);
  });

  test("model and strength fall back to defaults", () => {
    const wf = controlnet.build({ prompt: "x", control_image: "c.png", seed: 4, },);
    expect(wf["6"].inputs["control_net_name"],).toBe("control_v11p_sd15_canny",);
    expect(wf["7"].inputs["strength"],).toBe(1,);
  });
});

describe("upscale build", () => {
  test("wires loader, model, upscale, and save nodes", () => {
    const wf = upscale.build({
      input_image: "small.png",
      upscale_model: "RealESRGAN_x4plus_anime_6B",
    },);
    expect(wf["1"].class_type,).toBe("LoadImage",);
    expect(wf["1"].inputs["image"],).toBe("small.png",);
    expect(wf["2"].class_type,).toBe("UpscaleModelLoader",);
    expect(wf["2"].inputs["model_name"],).toBe("RealESRGAN_x4plus_anime_6B",);
    expect(wf["3"].class_type,).toBe("ImageUpscaleWithModel",);
    expect(wf["3"].inputs["upscale_model"],).toEqual(["2", 0,],);
    expect(wf["3"].inputs["image"],).toEqual(["1", 0,],);
    expect(wf["4"].class_type,).toBe("SaveImage",);
    expect(wf["4"].inputs["filename_prefix"],).toBe("loop-lore-upscaled",);
    expect(wf["4"].inputs["images"],).toEqual(["3", 0,],);
  });

  test("upscale model defaults to RealESRGAN_x4plus", () => {
    const wf = upscale.build({ input_image: "s.png", },);
    expect(wf["2"].inputs["model_name"],).toBe("RealESRGAN_x4plus",);
  });
});
