// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { assertGeneratedGraph, validateGeneratedGraph, } from "./generated-validation";

/** Minimal linked txt2img graph: loader -> encode/latent -> sampler -> save. */
function linkedGraph(): ComfyUIWorkflow {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors", }, },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a cat", clip: ["1", 1,], }, },
    "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1, }, },
    "4": { class_type: "KSampler", inputs: { model: ["1", 0,], positive: ["2", 0,], latent_image: ["3", 0,], }, },
    "5": { class_type: "SaveImage", inputs: { images: ["4", 0,], }, },
  };
}

describe("validateGeneratedGraph", () => {
  it("passes a fully linked graph with a sink and no placeholders", () => {
    const result = validateGeneratedGraph(linkedGraph(),);

    expect(result.ok,).toBe(true,);
    expect(result.errors,).toEqual([],);
  });

  it("rejects a graph with no terminal sink", () => {
    const graph: ComfyUIWorkflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors", }, },
      "2": { class_type: "KSampler", inputs: { model: ["1", 0,], }, },
    }; // linked, but no sink node

    const result = validateGeneratedGraph(graph,);

    expect(result.ok,).toBe(false,);
    expect(result.errors.join(" ",),).toContain("no terminal sink",);
  });

  it("rejects a residual placeholder left in an input", () => {
    const graph = linkedGraph();
    graph["2"]!.inputs.text = "{{prompt}}";

    const result = validateGeneratedGraph(graph,);

    expect(result.ok,).toBe(false,);
    expect(result.errors.join(" ",),).toContain("prompt",);
  });

  it("rejects an unreferenced dead node", () => {
    const graph = linkedGraph();
    graph["9"] = { class_type: "CLIPLoader", inputs: { clip_name: "stale.gguf", }, };

    const result = validateGeneratedGraph(graph,);

    expect(result.ok,).toBe(false,);
    expect(result.errors.join(" ",),).toContain("9",);
  });

  it("accepts an exempted converter node but never a listed non-allowlisted dead node", () => {
    const graph = linkedGraph();
    graph["9"] = { class_type: "ResolutionSelector", inputs: { width: 512, }, };

    // Allowlisted converter classes are already sinks to findDeadNodes, so
    // this passes with (and without) the exemption — listing one is harmless.
    expect(validateGeneratedGraph(graph, { unreferencedLive: ["9",], },).ok,).toBe(true,);

    // The option cannot smuggle a hand-authored dead node through: its class
    // is not in UNREFERENCED_LIVE_CLASSES.
    graph["10"] = { class_type: "CLIPLoader", inputs: { clip_name: "stale.gguf", }, };
    expect(validateGeneratedGraph(graph, { unreferencedLive: ["9", "10",], },).ok,).toBe(false,);
  });

  it("never throws on malformed input", () => {
    const result = validateGeneratedGraph(null as unknown as ComfyUIWorkflow,);

    expect(result.ok,).toBe(false,);
    expect(result.errors,).toEqual(["graph must be an object",],);
  });
});

describe("assertGeneratedGraph", () => {
  it("returns normally for a valid graph and throws for an invalid one", () => {
    expect(() => assertGeneratedGraph(linkedGraph(),)).not.toThrow();
    expect(() => assertGeneratedGraph({},)).toThrow(Error,);
  });
});
