/**
 * LoRA Discovery Tests
 *
 * Unit tests for LoRA discovery functions.
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import {
  clearDiscoveryCache,
  discoverLoras,
  getCachedLoras,
  getCacheStatus,
} from "./discovery";
import { buildComfyUILoraNode, discoverComfyUILoras, injectComfyUILora, } from "./discovery-comfyui";
import { buildSdCppLoraPrefix, discoverSdCppLoras, injectSdCppLora, } from "./discovery-sdserver";

// ── Mock Helpers ─────────────────────────────────────────

// Use a helper to mock fetch that works with Bun's testing
/**
 * @param handler
 * @param fn
 */
async function withMockFetch(
  handler: (url: string,) => Response | Promise<Response>,
  fn: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;

  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

// ── sd.cpp Discovery Tests ───────────────────────────────

describe("discoverSdCppLoras", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  },);

  it("discovers LoRA models from sd.cpp", async () => {
    const mockModels = [
      { id: "model1.safetensors", root: "model1.safetensors", },
      { id: "model2.pt", root: "model2.pt", },
      { id: "regular_model.safetensors", root: "regular_model.safetensors", },
    ];

    await withMockFetch(
      (url,) => {
        if (url.includes("/sd-api/v1/models",)) {
          return Response.json({ data: mockModels, },);
        }

        return new Response("Not Found", { status: 404, },);
      },
      async () => {
        const result = await discoverSdCppLoras("http://localhost:9010",);

        expect(result.error,).toBeUndefined();
        expect(result.backend,).toBe("sd-server",);
        expect(result.models.length,).toBe(3,);
        expect(result.models[0]?.name,).toBe("model1",);
        expect(result.models[0]?.backend,).toBe("sd-server",);
      },
    );
  });

  it("handles connection errors", async () => {
    await withMockFetch(
      () => {
        throw new Error("ECONNREFUSED",);
      },
      async () => {
        const result = await discoverSdCppLoras("http://localhost:9999",);

        expect(result.error,).toContain("not reachable",);
        expect(result.models,).toEqual([],);
      },
    );
  });

  it("handles timeout", async () => {
    await withMockFetch(
      () => {
        throw new DOMException("The operation was aborted", "AbortError",);
      },
      async () => {
        const result = await discoverSdCppLoras("http://localhost:9010", 100,);

        expect(result.error,).toContain("timed out",);
        expect(result.models,).toEqual([],);
      },
    );
  });
});

describe("buildSdCppLoraPrefix", () => {
  it("builds correct prefix", () => {
    expect(buildSdCppLoraPrefix("my_lora", 0.7,),).toBe("[lora:my_lora:0.7]",);
    expect(buildSdCppLoraPrefix("character", 0.5,),).toBe("[lora:character:0.5]",);
  });
});

describe("injectSdCppLora", () => {
  it("injects LoRA into prompt", () => {
    const result = injectSdCppLora("a beautiful portrait", "my_lora", 0.7,);
    expect(result,).toBe("[lora:my_lora:0.7] a beautiful portrait",);
  });

  it("handles empty prompt", () => {
    const result = injectSdCppLora("", "my_lora", 0.5,);
    expect(result,).toBe("[lora:my_lora:0.5] ",);
  });
});

// ── ComfyUI Discovery Tests ──────────────────────────────

describe("discoverComfyUILoras", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  },);

  it("discovers LoRA models from ComfyUI", async () => {
    const mockLoraNames = ["character_v1.safetensors", "style_realistic.pt",];

    await withMockFetch(
      (url,) => {
        if (url.includes("/object_info",)) {
          return Response.json({
            LoraLoader: {
              input: {
                required: {
                  lora_name: [mockLoraNames, {},],
                  strength_model: [1, {},],
                  strength_clip: [1, {},],
                },
              },
            },
          },);
        }

        return new Response("Not Found", { status: 404, },);
      },
      async () => {
        const result = await discoverComfyUILoras("http://localhost:8188",);

        expect(result.error,).toBeUndefined();
        expect(result.backend,).toBe("comfyui",);
        expect(result.models.length,).toBe(2,);
        expect(result.models[0]?.name,).toBe("character_v1",);
        expect(result.models[0]?.filename,).toBe("character_v1.safetensors",);
        expect(result.models[0]?.backend,).toBe("comfyui",);
      },
    );
  });

  it("handles missing LoraLoader node", async () => {
    await withMockFetch(
      (url,) => {
        if (url.includes("/object_info",)) {
          return Response.json({},);
        }

        return new Response("Not Found", { status: 404, },);
      },
      async () => {
        const result = await discoverComfyUILoras("http://localhost:8188",);

        expect(result.error,).toContain("LoraLoader node not found",);
        expect(result.models,).toEqual([],);
      },
    );
  });

  it("handles connection errors", async () => {
    await withMockFetch(
      () => {
        throw new Error("ECONNREFUSED",);
      },
      async () => {
        const result = await discoverComfyUILoras("http://localhost:9999",);

        expect(result.error,).toContain("not reachable",);
        expect(result.models,).toEqual([],);
      },
    );
  });
});

describe("buildComfyUILoraNode", () => {
  it("builds correct node", () => {
    const node = buildComfyUILoraNode("model.safetensors", 0.7,);

    expect(node.class_type,).toBe("LoraLoader",);
    expect((node.inputs as Record<string, unknown>).lora_name,).toBe("model.safetensors",);
    expect((node.inputs as Record<string, unknown>).strength_model,).toBeCloseTo(0.7,);
    expect((node.inputs as Record<string, unknown>).strength_clip,).toBeCloseTo(0.7,);
  });

  it("uses different clip strength", () => {
    const node = buildComfyUILoraNode("model.safetensors", 0.7, 0.5,);

    expect((node.inputs as Record<string, unknown>).strength_model,).toBeCloseTo(0.7,);
    expect((node.inputs as Record<string, unknown>).strength_clip,).toBeCloseTo(0.5,);
  });

  it("connects to a producer with explicit output slots", () => {
    const node = buildComfyUILoraNode(
      "model.safetensors",
      0.7,
      undefined,
      ["5", 0,],
      ["5", 1,],
    );

    expect((node.inputs as Record<string, unknown>).model,).toEqual(["5", 0,],);
    expect((node.inputs as Record<string, unknown>).clip,).toEqual(["5", 1,],);
  });
});

type TestNode = { class_type: string; inputs: Record<string, unknown> };

/** Small API-format graph: checkpoint feeds CLIP encodes and the sampler. */
function apiFormatGraph(): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "sd.safetensors", },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: "positive", clip: ["1", 1,], },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "negative", clip: ["1", 1,], },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 512, height: 512, batch_size: 1, },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0,],
        positive: ["2", 0,],
        negative: ["3", 0,],
        latent_image: ["4", 0,],
        seed: 0,
        steps: 20,
        cfg: 8,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
      },
    },
  };
}

/** LoraLoader ids and inputs in graph order. */
function loraLoaders(
  workflow: Record<string, unknown>,
): Array<[string, Record<string, unknown>,]> {
  return Object.entries(workflow,)
    .filter(([, node,],) => (node as TestNode).class_type === "LoraLoader")
    .map(([id, node,],): [string, Record<string, unknown>,] => [id, (node as TestNode).inputs,]);
}

describe("injectComfyUILora", () => {
  it("inserts the loader between the producer and every MODEL/CLIP consumer", () => {
    const result = injectComfyUILora(apiFormatGraph(), "model.safetensors", 0.7,);
    const nodes = result as Record<string, TestNode>;
    const loaders = loraLoaders(result,);
    const entry = loaders[0];

    expect(entry,).toBeDefined();
    if (!entry) { return; }
    const [loaderId, loader,] = entry;

    // No created node references itself in a MODEL/CLIP input.
    expect(loaderId,).not.toBe("1",);
    expect(loader.model,).toEqual(["1", 0,],);
    expect(loader.clip,).toEqual(["1", 1,],);

    // Every original consumer reaches the loader; unrelated links stay put.
    expect(nodes["2"]?.inputs.clip,).toEqual([loaderId, 1,],);
    expect(nodes["3"]?.inputs.clip,).toEqual([loaderId, 1,],);
    expect(nodes["5"]?.inputs.model,).toEqual([loaderId, 0,],);
    expect(nodes["5"]?.inputs.positive,).toEqual(["2", 0,],);
  });

  it("chains two LoRAs in request order with their strengths", () => {
    let workflow = injectComfyUILora(apiFormatGraph(), "first.safetensors", 0.3, 0.4,);
    workflow = injectComfyUILora(workflow, "second.safetensors", 0.8,);

    const loaders = loraLoaders(workflow,);
    const first = loaders[0];
    const second = loaders[1];

    expect(first,).toBeDefined();
    expect(second,).toBeDefined();
    if (!first || !second) { return; }
    const [firstId, firstInputs,] = first;
    const [secondId, secondInputs,] = second;

    expect(firstInputs.lora_name,).toBe("first.safetensors",);
    expect(firstInputs.strength_model,).toBeCloseTo(0.3,);
    expect(firstInputs.strength_clip,).toBeCloseTo(0.4,);
    expect(firstInputs.model,).toEqual(["1", 0,],);
    expect(firstInputs.clip,).toEqual(["1", 1,],);

    expect(secondInputs.lora_name,).toBe("second.safetensors",);
    expect(secondInputs.strength_model,).toBeCloseTo(0.8,);
    expect(secondInputs.strength_clip,).toBeCloseTo(0.8,);
    expect(secondInputs.model,).toEqual([firstId, 0,],);
    expect(secondInputs.clip,).toEqual([firstId, 1,],);

    // Every original MODEL/CLIP consumer reaches the final loader.
    const nodes = workflow as Record<string, TestNode>;
    expect(nodes["2"]?.inputs.clip,).toEqual([secondId, 1,],);
    expect(nodes["3"]?.inputs.clip,).toEqual([secondId, 1,],);
    expect(nodes["5"]?.inputs.model,).toEqual([secondId, 0,],);
  });
});

// ── Unified Discovery Tests ──────────────────────────────

describe("discoverLoras", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  },);

  it("caches successful results", async () => {
    let fetchCount = 0;

    await withMockFetch(
      (url,) => {
        if (url.includes("/object_info",)) {
          fetchCount++;
          return Response.json({
            LoraLoader: {
              input: {
                required: {
                  lora_name: [["model.safetensors",], {},],
                  strength_model: [1, {},],
                  strength_clip: [1, {},],
                },
              },
            },
          },);
        }

        return new Response("Not Found", { status: 404, },);
      },
      async () => {
        // First call
        const result1 = await discoverLoras("comfyui", "http://localhost:8188",);
        expect(result1.models.length,).toBe(1,);

        // Second call should use cache
        const result2 = await discoverLoras("comfyui", "http://localhost:8188",);
        expect(result2.models.length,).toBe(1,);

        // Only one fetch should have occurred
        expect(fetchCount,).toBe(1,);
      },
    );
  });

  it("force refresh bypasses cache", async () => {
    let fetchCount = 0;

    await withMockFetch(
      (url,) => {
        if (url.includes("/object_info",)) {
          fetchCount++;
          return Response.json({
            LoraLoader: {
              input: {
                required: {
                  lora_name: [["model.safetensors",], {},],
                  strength_model: [1, {},],
                  strength_clip: [1, {},],
                },
              },
            },
          },);
        }

        return new Response("Not Found", { status: 404, },);
      },
      async () => {
        // First call
        await discoverLoras("comfyui", "http://localhost:8188",);

        // Force refresh
        await discoverLoras("comfyui", "http://localhost:8188", { forceRefresh: true, },);

        // Two fetches should have occurred
        expect(fetchCount,).toBe(2,);
      },
    );
  });
});

describe("getCachedLoras", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  },);

  it("returns empty array when no cache", () => {
    const models = getCachedLoras();
    expect(models,).toEqual([],);
  });
});

describe("getCacheStatus", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  },);

  it("returns cache stats", () => {
    const status = getCacheStatus();
    expect(status.entries,).toBe(0,);
    expect(status.nextExpiration,).toBeNull();
  });
});
