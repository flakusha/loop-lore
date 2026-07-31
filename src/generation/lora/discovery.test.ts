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
function withMockFetch(
  handler: (url: string,) => Response | Promise<Response>,
  fn: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, unicorn/no-global-object-property-assignment
  (globalThis as Record<string, unknown>).fetch = handler;
  return fn().finally(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, unicorn/no-global-object-property-assignment
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  },);
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

  it("connects to previous node", () => {
    const node = buildComfyUILoraNode("model.safetensors", 0.7, undefined, "5",);

    expect((node.inputs as Record<string, unknown>).model,).toEqual(["5", 0,],);
    expect((node.inputs as Record<string, unknown>).clip,).toEqual(["5", 1,],);
  });
});

describe("injectComfyUILora", () => {
  it("injects LoraLoader node into workflow", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        inputs: {},
        outputs: { MODEL: [], CLIP: [], },
      },
    };

    const result = injectComfyUILora(workflow, "model.safetensors", 0.7,);

    // Should have 2 nodes now
    expect(Object.keys(result,).length,).toBe(2,);

    // Find the LoraLoader node
    const loraNode = Object.values(result,).find(
      (n,) => (n as Record<string, unknown>).class_type === "LoraLoader",
    ) as Record<string, unknown>;

    expect(loraNode,).toBeDefined();
    expect((loraNode.inputs as Record<string, unknown>).lora_name,).toBe("model.safetensors",);
    expect((loraNode.inputs as Record<string, unknown>).strength_model,).toBeCloseTo(0.7,);
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
