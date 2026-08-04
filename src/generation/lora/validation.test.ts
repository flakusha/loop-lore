/**
 * Tests for LoRA validation helpers (src/generation/lora/validation.ts).
 *
 * Pure validation: config/model object checks, filename handling, and
 * strength clamping/range helpers. No I/O or DB.
 */
import { describe, expect, test, } from "bun:test";
import {
  clampStrength,
  extractLoRAName,
  isLoRAFilename,
  isTypicalStrength,
  validateLoRAConfig,
  validateLoRAModel,
} from "./validation";

describe("validateLoRAConfig", () => {
  test("returns null for a valid config", () => {
    expect(validateLoRAConfig({
      name: "my_lora",
      strength: 0.5,
      backend: "comfyui",
    },),).toBeNull();
  });

  test("rejects a non-object", () => {
    expect(validateLoRAConfig(null,),).toBe("LoRA config must be an object",);
    expect(validateLoRAConfig("x",),).toBe("LoRA config must be an object",);
    expect(validateLoRAConfig(undefined,),).toBe("LoRA config must be an object",);
  });

  test("rejects a missing or blank name", () => {
    expect(validateLoRAConfig({ strength: 0.5, backend: "comfyui", },),)
      .toBe("Invalid LoRA name",);
    expect(validateLoRAConfig({ name: " ".repeat(3,), strength: 0.5, backend: "comfyui", },),)
      .toBe("Invalid LoRA name",);
  });

  test("rejects a non-number strength", () => {
    expect(validateLoRAConfig({ name: "x", strength: "0.5", backend: "comfyui", },),)
      .toBe("LoRA strength must be a number",);
  });

  test("rejects non-finite strength (NaN/Infinity)", () => {
    expect(validateLoRAConfig({ name: "x", strength: NaN, backend: "comfyui", },),)
      .toBe("LoRA strength must be a finite number",);
    expect(validateLoRAConfig({ name: "x", strength: Infinity, backend: "comfyui", },),)
      .toBe("LoRA strength must be a finite number",);
  });

  test("rejects out-of-range strength", () => {
    expect(validateLoRAConfig({ name: "x", strength: 0.05, backend: "comfyui", },),)
      .toBe("LoRA strength must be between 0.1 and 1",);
    expect(validateLoRAConfig({ name: "x", strength: 1.5, backend: "comfyui", },),)
      .toBe("LoRA strength must be between 0.1 and 1",);
  });

  test("accepts boundary strength values", () => {
    expect(validateLoRAConfig({ name: "x", strength: 0.1, backend: "comfyui", },),).toBeNull();
    expect(validateLoRAConfig({ name: "x", strength: 1, backend: "comfyui", },),).toBeNull();
  });

  test("rejects an unknown backend", () => {
    expect(validateLoRAConfig({ name: "x", strength: 0.5, backend: "other", },),)
      .toBe("LoRA backend must be 'comfyui' or 'sd-server'",);
  });
});

describe("validateLoRAModel", () => {
  const valid = {
    name: "model",
    filename: "model.safetensors",
    path: "/models/lora/model.safetensors",
    backend: "comfyui",
  };

  test("returns null for a valid model", () => {
    expect(validateLoRAModel(valid,),).toBeNull();
  });

  test("rejects a non-object", () => {
    expect(validateLoRAModel(null,),).toBe("LoRA model must be an object",);
  });

  test.each(["name", "filename", "path",],)("rejects a blank required %s", (field,) => {
    expect(validateLoRAModel({ ...valid, [field]: "", },),)
      .toBe(`Invalid LoRA model ${field}`,);
    expect(validateLoRAModel({ ...valid, [field]: " ".repeat(3,), },),)
      .toBe(`Invalid LoRA model ${field}`,);
  },);

  test("rejects an unknown backend", () => {
    expect(validateLoRAModel({ ...valid, backend: "x", },),)
      .toBe("LoRA model backend must be 'comfyui' or 'sd-server'",);
  });

  test("rejects a non-number size when provided", () => {
    expect(validateLoRAModel({ ...valid, size: "big", },),)
      .toBe("LoRA model size must be a number",);
  });

  test("accepts a numeric size", () => {
    expect(validateLoRAModel({ ...valid, size: 1234, },),).toBeNull();
  });

  test("rejects non-array triggerWords", () => {
    expect(validateLoRAModel({ ...valid, triggerWords: "cat", },),)
      .toBe("LoRA triggerWords must be an array",);
  });

  test("rejects triggerWords containing a non-string", () => {
    expect(validateLoRAModel({ ...valid, triggerWords: ["cat", 7,], },),)
      .toBe("LoRA triggerWords must contain only strings",);
  });

  test("accepts string triggerWords", () => {
    expect(validateLoRAModel({ ...valid, triggerWords: ["cat", "girl",], },),).toBeNull();
  });

  test("rejects out-of-range recommendedStrength", () => {
    expect(validateLoRAModel({ ...valid, recommendedStrength: 2, },),)
      .toBe("LoRA recommendedStrength must be between 0.1 and 1",);
    expect(validateLoRAModel({ ...valid, recommendedStrength: "0.5", },),)
      .toBe("LoRA recommendedStrength must be a number",);
  });
});

describe("isLoRAFilename", () => {
  test("accepts known LoRA extensions", () => {
    expect(isLoRAFilename("model.safetensors",),).toBe(true,);
    expect(isLoRAFilename("model.pt",),).toBe(true,);
    expect(isLoRAFilename("model.ckpt",),).toBe(true,);
    expect(isLoRAFilename("model.bin",),).toBe(true,);
  });

  test("accepts extensions case-insensitively", () => {
    expect(isLoRAFilename("MODEL.SAFETENSORS",),).toBe(true,);
  });

  test("rejects other/unknown extensions", () => {
    expect(isLoRAFilename("model.json",),).toBe(false,);
    expect(isLoRAFilename("model",),).toBe(false,);
  });
});

describe("extractLoRAName", () => {
  test("strips the last extension", () => {
    expect(extractLoRAName("my_character.safetensors",),).toBe("my_character",);
  });

  test("only strips the final dot segment", () => {
    expect(extractLoRAName("a.b.model.pt",),).toBe("a.b.model",);
  });

  test("returns the filename unchanged when no dot", () => {
    expect(extractLoRAName("plainname",),).toBe("plainname",);
  });
});

describe("clampStrength", () => {
  test("clamps below the minimum", () => {
    expect(clampStrength(0.01,),).toBeCloseTo(0.1,);
  });

  test("clamps above the maximum", () => {
    expect(clampStrength(2,),).toBe(1,);
  });

  test("passes through in-range values", () => {
    expect(clampStrength(0.5,),).toBeCloseTo(0.5,);
    expect(clampStrength(0.1,),).toBeCloseTo(0.1,);
    expect(clampStrength(1,),).toBe(1,);
  });
});

describe("isTypicalStrength", () => {
  test("returns true within the typical range (0.3-0.7)", () => {
    expect(isTypicalStrength(0.3,),).toBe(true,);
    expect(isTypicalStrength(0.5,),).toBe(true,);
    expect(isTypicalStrength(0.7,),).toBe(true,);
  });

  test("returns false outside the typical range", () => {
    expect(isTypicalStrength(0.2,),).toBe(false,);
    expect(isTypicalStrength(0.8,),).toBe(false,);
    expect(isTypicalStrength(0.1,),).toBe(false,);
    expect(isTypicalStrength(1,),).toBe(false,);
  });
});
