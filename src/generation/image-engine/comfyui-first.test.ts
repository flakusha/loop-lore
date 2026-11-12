// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/comfyui-first.ts — the /image
 * ComfyUI-first opt-in ordering.
 *
 * Asserts both knob states: OFF (default) returns the candidate list
 * untouched (exact current behavior); ON stably partitions ComfyUI candidates
 * ahead of the rest while preserving relative order, across stored setups and
 * config providers of every family.
 */
import { describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { comfyUiFirstOrder, } from "./comfyui-first";

const provider = (name: string, apiFamily: ImageProviderConfig["apiFamily"],): ImageProviderConfig => ({
  name,
  label: name,
  baseUrl: "http://127.0.0.1:9000",
  apiFamily,
  defaults: { width: 64, height: 64, steps: 1, cfgScale: 1, sampler: "euler", },
  timeout: 250,
  generationTimeout: 250,
});

describe("comfyUiFirstOrder", () => {
  const configList = [
    provider("sd-a", "sdcpp",),
    provider("comfy-a", "comfyui",),
    provider("openai-b", "openai",),
    provider("comfy-b", "comfyui",),
  ];

  it("knob OFF returns the list untouched (current behavior)", () => {
    const ordered = comfyUiFirstOrder(configList, undefined,);
    expect(ordered,).toBe(configList,);
    expect(ordered.map((candidate,) => candidate.name),).toEqual(["sd-a", "comfy-a", "openai-b", "comfy-b",],);
  });

  it("knob OFF explicitly false behaves like undefined", () => {
    const ordered = comfyUiFirstOrder(configList, false,);
    expect(ordered,).toBe(configList,);
  });

  it("knob ON orders ComfyUI candidates first, preserving relative order", () => {
    const ordered = comfyUiFirstOrder(configList, true,);
    expect(ordered.map((candidate,) => candidate.name),).toEqual(["comfy-a", "comfy-b", "sd-a", "openai-b",],);
  });

  it("knob ON with no ComfyUI candidates keeps the chain order", () => {
    const list = [provider("sd-a", "sdcpp",), provider("openai-b", "openai",),];
    const ordered = comfyUiFirstOrder(list, true,);
    expect(ordered.map((candidate,) => candidate.name),).toEqual(["sd-a", "openai-b",],);
  });

  it("knob ON with only ComfyUI candidates keeps their order", () => {
    const list = [provider("comfy-a", "comfyui",), provider("comfy-b", "comfyui",),];
    const ordered = comfyUiFirstOrder(list, true,);
    expect(ordered.map((candidate,) => candidate.name),).toEqual(["comfy-a", "comfy-b",],);
  });
});
