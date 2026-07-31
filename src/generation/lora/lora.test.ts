/**
 * LoRA Validation Tests
 *
 * Unit tests for LoRA validation functions.
 */

import { describe, expect, it, } from "bun:test";
import {
  LORA_STRENGTH_MAX,
  LORA_STRENGTH_MIN,
} from "./types";
import {
  clampStrength,
  extractLoRAName,
  isLoRAFilename,
  isTypicalStrength,
  validateLoRAConfig,
  validateLoRAModel,
} from "./validation";

describe("validateLoRAConfig", () => {
  it("accepts valid config", () => {
    const result = validateLoRAConfig({
      name: "my_lora",
      strength: 0.5,
      backend: "comfyui",
    },);
    expect(result,).toBeNull();
  });

  it("rejects null/undefined", () => {
    expect(validateLoRAConfig(null,),).toBe("LoRA config must be an object",);
    expect(validateLoRAConfig(undefined,),).toBe("LoRA config must be an object",);
  });

  it("rejects non-object", () => {
    expect(validateLoRAConfig("string",),).toBe("LoRA config must be an object",);
    expect(validateLoRAConfig(123,),).toBe("LoRA config must be an object",);
  });

  it("rejects empty name", () => {
    expect(validateLoRAConfig({ name: "", strength: 0.5, backend: "comfyui", },),).toBe("Invalid LoRA name",);
    expect(validateLoRAConfig({ name: "  ", strength: 0.5, backend: "comfyui", },),).toBe("Invalid LoRA name",);
  });

  it("rejects invalid strength", () => {
    expect(validateLoRAConfig({ name: "test", strength: "high", backend: "comfyui", },),).toBe(
      "LoRA strength must be a number",
    );
    expect(validateLoRAConfig({ name: "test", strength: 0.05, backend: "comfyui", },),).toContain("must be between",);
    expect(validateLoRAConfig({ name: "test", strength: 1.5, backend: "comfyui", },),).toContain("must be between",);
  });

  it("rejects invalid backend", () => {
    expect(validateLoRAConfig({ name: "test", strength: 0.5, backend: "invalid", },),).toBe(
      "LoRA backend must be 'comfyui' or 'sd-server'",
    );
  });

  it("accepts boundary values", () => {
    expect(validateLoRAConfig({ name: "test", strength: LORA_STRENGTH_MIN, backend: "comfyui", },),).toBeNull();
    expect(validateLoRAConfig({ name: "test", strength: LORA_STRENGTH_MAX, backend: "comfyui", },),).toBeNull();
  });
});

describe("validateLoRAModel", () => {
  it("accepts valid model", () => {
    const result = validateLoRAModel({
      name: "my_lora",
      filename: "my_lora.safetensors",
      path: "/models/loras/my_lora.safetensors",
      backend: "comfyui",
    },);
    expect(result,).toBeNull();
  });

  it("accepts model with optional fields", () => {
    const result = validateLoRAModel({
      name: "my_lora",
      filename: "my_lora.safetensors",
      path: "/models/loras/my_lora.safetensors",
      backend: "sd-server",
      size: 1024 * 1024,
      triggerWords: ["character", "portrait",],
      recommendedStrength: 0.6,
    },);
    expect(result,).toBeNull();
  });

  it("rejects null/undefined", () => {
    expect(validateLoRAModel(null,),).toBe("LoRA model must be an object",);
    expect(validateLoRAModel(undefined,),).toBe("LoRA model must be an object",);
  });

  it("rejects missing required fields", () => {
    expect(validateLoRAModel({ name: "", filename: "test.safetensors", path: "/test", backend: "comfyui", },),).toBe(
      "Invalid LoRA model name",
    );
    expect(validateLoRAModel({ name: "test", filename: "", path: "/test", backend: "comfyui", },),).toBe(
      "Invalid LoRA model filename",
    );
    expect(validateLoRAModel({ name: "test", filename: "test.safetensors", path: "", backend: "comfyui", },),).toBe(
      "Invalid LoRA model path",
    );
    expect(validateLoRAModel({ name: "test", filename: "test.safetensors", path: "/test", backend: "invalid", },),)
      .toBe("LoRA model backend must be 'comfyui' or 'sd-server'",);
  });

  it("rejects invalid optional fields", () => {
    expect(
      validateLoRAModel({
        name: "test",
        filename: "test.safetensors",
        path: "/test",
        backend: "comfyui",
        size: "not-a-number",
      },),
    ).toBe("LoRA model size must be a number",);
    expect(
      validateLoRAModel({
        name: "test",
        filename: "test.safetensors",
        path: "/test",
        backend: "comfyui",
        triggerWords: "not-array",
      },),
    ).toBe("LoRA triggerWords must be an array",);
    expect(
      validateLoRAModel({
        name: "test",
        filename: "test.safetensors",
        path: "/test",
        backend: "comfyui",
        triggerWords: [123,],
      },),
    ).toBe("LoRA triggerWords must contain only strings",);
    expect(
      validateLoRAModel({
        name: "test",
        filename: "test.safetensors",
        path: "/test",
        backend: "comfyui",
        recommendedStrength: "high",
      },),
    ).toBe("LoRA recommendedStrength must be a number",);
    expect(
      validateLoRAModel({
        name: "test",
        filename: "test.safetensors",
        path: "/test",
        backend: "comfyui",
        recommendedStrength: 2,
      },),
    ).toContain("must be between",);
  });
});

describe("isLoRAFilename", () => {
  it("accepts valid extensions", () => {
    expect(isLoRAFilename("model.safetensors",),).toBe(true,);
    expect(isLoRAFilename("model.pt",),).toBe(true,);
    expect(isLoRAFilename("model.ckpt",),).toBe(true,);
    expect(isLoRAFilename("model.bin",),).toBe(true,);
    expect(isLoRAFilename("MODEL.SAFETENSORS",),).toBe(true,);
  });

  it("rejects invalid extensions", () => {
    expect(isLoRAFilename("model.json",),).toBe(false,);
    expect(isLoRAFilename("model.txt",),).toBe(false,);
    expect(isLoRAFilename("model",),).toBe(false,);
  });
});

describe("extractLoRAName", () => {
  it("strips extension", () => {
    expect(extractLoRAName("my_lora.safetensors",),).toBe("my_lora",);
    expect(extractLoRAName("model.pt",),).toBe("model",);
    expect(extractLoRAName("model.ckpt",),).toBe("model",);
  });

  it("handles no extension", () => {
    expect(extractLoRAName("model",),).toBe("model",);
  });

  it("handles multiple dots", () => {
    expect(extractLoRAName("my.lora.model.safetensors",),).toBe("my.lora.model",);
  });
});

describe("clampStrength", () => {
  it("clamps to min", () => {
    expect(clampStrength(0.01,),).toBe(LORA_STRENGTH_MIN,);
    expect(clampStrength(-1,),).toBe(LORA_STRENGTH_MIN,);
  });

  it("clamps to max", () => {
    expect(clampStrength(1.5,),).toBe(LORA_STRENGTH_MAX,);
    expect(clampStrength(100,),).toBe(LORA_STRENGTH_MAX,);
  });

  it("passes through valid values", () => {
    expect(clampStrength(0.5,),).toBeCloseTo(0.5,);
    expect(clampStrength(0.3,),).toBeCloseTo(0.3,);
    expect(clampStrength(0.7,),).toBeCloseTo(0.7,);
  });
});

describe("isTypicalStrength", () => {
  it("identifies typical range", () => {
    expect(isTypicalStrength(0.3,),).toBe(true,);
    expect(isTypicalStrength(0.5,),).toBe(true,);
    expect(isTypicalStrength(0.7,),).toBe(true,);
  });

  it("identifies atypical values", () => {
    expect(isTypicalStrength(0.2,),).toBe(false,);
    expect(isTypicalStrength(0.8,),).toBe(false,);
    expect(isTypicalStrength(0.1,),).toBe(false,);
    expect(isTypicalStrength(1,),).toBe(false,);
  });
});
