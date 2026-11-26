// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { applyLoraSlots, findLoraModel, resolveLoraSlotFiles, resolveLoraSlotNode, } from "./apply-slots";
import type { LoRAModel, } from "./types";

const QWEN_T2I = new URL("../../../configs/workflows/qwen-image-2-1-t2i-v1.json", import.meta.url,);

function loadGraph(): Record<string, unknown> {
  return JSON.parse(readFileSync(QWEN_T2I, "utf8",),) as Record<string, unknown>;
}

function inputsOf(graph: Record<string, unknown>, nodeId: string,): Record<string, unknown> {
  const node = graph[nodeId] as { inputs: Record<string, unknown> };
  return node.inputs;
}

describe("applyLoraSlots against the shipped qwen t2i export", () => {
  it("resolves all 26 slots on the single WASPowerLoraLoader node", () => {
    const resolved = resolveLoraSlotNode(loadGraph(),);
    expect(resolved?.nodeId,).toBe("498",);
    expect(resolved?.classType,).toBe("WASPowerLoraLoader",);
    expect(resolved?.slotIndices,).toEqual(
      Array.from({ length: 26, }, (_unused, i,) => i + 1,),
    );
  });

  it("fills slots 1-2 and clears 3-26 without touching links or the source graph", () => {
    const graph = loadGraph();
    const resolved = resolveLoraSlotNode(graph,)!;
    const applied = applyLoraSlots(graph, resolved, [
      { filename: "alpha.safetensors", strength: 0.6, },
      { filename: "beta.safetensors", strength: 0.4, },
    ],);

    const inputs = inputsOf(applied, "498",);
    expect(inputs["lora_1"],).toBe("alpha.safetensors",);
    expect(inputs["lora_1_weight"],).toBe(0.6,);
    expect(inputs["lora_1_enabled"],).toBe(true,);
    expect(inputs["lora_2"],).toBe("beta.safetensors",);
    expect(inputs["lora_2_weight"],).toBe(0.4,);
    expect(inputs["lora_2_enabled"],).toBe(true,);

    for (let i = 3; i <= 26; i++) {
      expect(inputs[`lora_${i}`],).toBe("None",);
      expect(inputs[`lora_${i}_enabled`],).toBe(false,);
    }

    // Pure: source graph is unchanged, and an unrelated linked node is the
    // very same object (so its links cannot have been rewired).
    expect(inputsOf(graph, "498",)["lora_1"],).toBe("None",);
    const linkedId = Object.keys(graph,).find((id,) =>
      Object.values(inputsOf(graph, id,),).some((value,) => Array.isArray(value,))
    )!;

    expect(inputsOf(applied, linkedId,),).toBe(inputsOf(graph, linkedId,),);
  });

  it("throws on over-capacity", () => {
    const graph = loadGraph();
    const resolved = resolveLoraSlotNode(graph,)!;
    const tooMany = Array.from({ length: 27, }, () => ({ filename: "x", strength: 1, }),);
    expect(() => applyLoraSlots(graph, resolved, tooMany,)).toThrow(/27 LoRAs/,);
  });
});

describe("resolveLoraSlotFiles", () => {
  const models: LoRAModel[] = [
    { name: "char", filename: "char.safetensors", path: "char.safetensors", backend: "comfyui", },
  ];

  it("prefers full filename over the stripped name", () => {
    expect(resolveLoraSlotFiles([{ name: "char.safetensors", strength: 0.7, },], models,),).toEqual([
      { filename: "char.safetensors", strength: 0.7, },
    ],);
  });

  it("falls back to the stripped name for backward compatibility", () => {
    expect(resolveLoraSlotFiles([{ name: "char", strength: 0.5, },], models,),).toEqual([
      { filename: "char.safetensors", strength: 0.5, },
    ],);
  });

  it("throws on an unknown name", () => {
    expect(() => resolveLoraSlotFiles([{ name: "missing", strength: 0.5, },], models,)).toThrow(
      /Unknown LoRA "missing"/,
    );
  });
});

describe("findLoraModel", () => {
  const models: LoRAModel[] = [
    {
      name: "portrait",
      filename: "portrait-v2.safetensors",
      path: "/models/portrait-v2.safetensors",
      backend: "comfyui",
    },
    { name: "style", filename: "style.safetensors", path: "/models/style.safetensors", backend: "comfyui", },
  ];

  it("matches a full discovered filename", () => {
    expect(findLoraModel("style.safetensors", models,),).toBe(models[1],);
  });

  it("falls back to the stripped display name", () => {
    expect(findLoraModel("portrait", models,),).toBe(models[0],);
  });

  it("returns undefined for an unknown name", () => {
    expect(findLoraModel("missing", models,),).toBeUndefined();
  });

  it("prefers a filename match over an earlier model with the same display name", () => {
    // Two passes, not one: the filename match must win even when a different
    // model earlier in the list would satisfy the stripped-name lookup.
    const ambiguous: LoRAModel[] = [
      { name: "style", filename: "other.safetensors", path: "other.safetensors", backend: "comfyui", },
      { name: "style", filename: "style.safetensors", path: "style.safetensors", backend: "comfyui", },
    ];

    expect(findLoraModel("style.safetensors", ambiguous,),).toBe(ambiguous[1],);
  });
});
