// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  ComfyUIModelsResponse,
  ComfyUIModelQuery,
  ComfyUIModelSelectionSchema,
} from "./comfyui-models";

describe("ComfyUIModelSelectionSchema", () => {
  test("accepts a partial override, rejects unknown keys", () => {
    expect(Value.Check(ComfyUIModelSelectionSchema, { clip: "enc.gguf", noVae: true, },),).toBe(true,);
    expect(Value.Check(ComfyUIModelSelectionSchema, { bogus: 1, },),).toBe(false,);
  });
});

describe("ComfyUIModelQuery", () => {
  test("provider is optional", () => {
    expect(Value.Check(ComfyUIModelQuery, {},),).toBe(true,);
    expect(Value.Check(ComfyUIModelQuery, { provider: "h3-local", },),).toBe(true,);
  });
});

describe("ComfyUIModelsResponse", () => {
  test("requires the full role view surface", () => {
    const role = { candidates: ["a.safetensors",], selected: null, source: "discovery", };
    const valid = {
      provider: "h3-local",
      noVae: false,
      clip: ["a.safetensors",],
      diffusion: [],
      vae: [],
      checkpoint: [],
      clip_vision: [],
      loras: [],
      clipRole: role,
      diffusionRole: role,
      vaeRole: role,
      checkpointRole: role,
      clipVisionRole: role,
      lorasRole: role,
    };

    expect(Value.Check(ComfyUIModelsResponse, valid,),).toBe(true,);
    expect(Value.Check(ComfyUIModelsResponse, { ...valid, clipRole: undefined, },),).toBe(false,);
  });
});
