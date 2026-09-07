// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/comfyui.ts — the ComfyUI workflow
 * backend (workflow loading + client hand-off against a refused
 * endpoint). Global fetch is stubbed where a canned reply is enough; the
 * runWorkflow hand-off is exercised against a refused local port so the
 * failure transport (rejection vs failure outcome) is observable without
 * pinning either shape.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { createLogger, } from "../../logger";
import { clearDiscoveryCache, } from "../lora/discovery";
import { generateComfyUI, } from "./comfyui";

// The workflow loader's per-file logging calls getLogger(), which throws
// when the root logger is uninitialized and aborts the directory scan —
// mirror the repo-wide test convention.
createLogger({ level: "error", },);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

const CONFIG = {
  name: "test-comfy",
  label: "Test ComfyUI",
  baseUrl: "http://127.0.0.1:9",
  apiFamily: "comfyui",
  defaults: {
    width: 128,
    height: 128,
    steps: 2,
    cfgScale: 4,
    sampler: "euler",
  },
  timeout: 250,
  generationTimeout: 250,
} satisfies ImageProviderConfig;

const OPTS = {
  prompt: "a tiny castle",
  n: 1,
  outputFormat: "png",
};

describe("generateComfyUI", () => {
  it("returns a 400 failure for an invalid base URL", async () => {
    const outcome = await generateComfyUI(
      { ...CONFIG, baseUrl: "not-a-url", },
      OPTS,
    );
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.status,).toBe(400,);
      expect(outcome.error,).toContain("Invalid ComfyUI URL",);
    }
  });

  it("propagates backend connection failures for a valid URL", async () => {
    // ComfyUIClient.runWorkflow rejects on a refused endpoint; the backend
    // does not wrap that into a failure outcome. Accept either transport
    // here — this pins that the workflow is loaded and handed to the
    // client, not the client's error transport.
    const settled = await generateComfyUI(CONFIG, OPTS,).then(
      (outcome,) => ({ ok: outcome.ok, error: outcome.ok ? "" : outcome.error, }),
      (error: unknown,) => ({ ok: false as const, error: (error as Error).message, }),
    );
    expect(settled.ok,).toBe(false,);
    expect(settled.error.length,).toBeGreaterThan(0,);
  });

  it("substitutes the prompt into the loaded workflow before dispatch", async () => {
    let submitted = "";
    const png = Buffer.from("comfy-png",);
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const target = String(url,);
      if (target.endsWith("/prompt",)) {
        submitted = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ prompt_id: "p-1", },), { status: 200, },);
      }
      if (target.includes("/history/",)) {
        // Completed execution with one output image on node "9".
        return new Response(
          JSON.stringify({
            "p-1": {
              prompt_id: "p-1",
              status: "completed",
              outputs: {
                "9": { images: [{ filename: "gen.png", subfolder: "", type: "output", },], },
              },
            },
          },),
          { status: 200, },
        );
      }
      if (target.includes("/view",)) {
        return new Response(png, { status: 200, headers: { "Content-Type": "image/png", }, },);
      }
      throw new Error(`unexpected stub call: ${target}`,);
    }) as typeof fetch;

    const outcome = await generateComfyUI(CONFIG, OPTS,);

    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.mimeType,).toBe("image/png",);
      expect(outcome.images,).toHaveLength(1,);
      expect(outcome.images[0]?.toString("utf8",),).toBe("comfy-png",);
    }
    const parsed = JSON.parse(submitted,) as {
      prompt: Record<string, { inputs: Record<string, unknown>; class_type: string }>;
    };
    expect(parsed.prompt["2"]?.inputs.text,).toBe("a tiny castle",);
    expect(parsed.prompt["2"]?.class_type,).toBe("CLIPTextEncode",);
    expect(parsed.prompt["1"]?.class_type,).toBe("CheckpointLoaderSimple",);
  });

  it("injects a LoraLoader node when the LoRA is discovered on the backend", async () => {
    clearDiscoveryCache("comfyui",);
    let submitted = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const target = String(url,);
      if (target.endsWith("/object_info",)) {
        return new Response(
          JSON.stringify({
            LoraLoader: {
              input: { required: { lora_name: [["char.safetensors", "other.safetensors",], {},], }, },
            },
          },),
          { status: 200, },
        );
      }
      if (target.endsWith("/prompt",)) {
        submitted = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ prompt_id: "p-2", },), { status: 200, },);
      }
      if (target.includes("/history/",)) {
        return new Response(
          JSON.stringify({ "p-2": { prompt_id: "p-2", status: "completed", outputs: {}, }, },),
          { status: 200, },
        );
      }
      throw new Error(`unexpected stub call: ${target}`,);
    }) as typeof fetch;

    const outcome = await generateComfyUI(CONFIG, {
      ...OPTS,
      lora: { name: "char", strength: 0.7, backend: "comfyui", },
    },);

    expect(outcome.ok,).toBe(true,);
    const parsed = JSON.parse(submitted,) as {
      prompt: Record<string, { inputs: Record<string, unknown>; class_type: string }>;
    };
    const loraNodes = Object.values(parsed.prompt,).filter((n,) => n.class_type === "LoraLoader");
    expect(loraNodes,).toHaveLength(1,);
    expect(loraNodes[0]?.inputs.lora_name,).toBe("char",);
  });

  it("warns and skips LoRA injection when the LoRA is unknown", async () => {
    clearDiscoveryCache("comfyui",);
    let submitted = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const target = String(url,);
      if (target.endsWith("/object_info",)) {
        return new Response(
          JSON.stringify({
            LoraLoader: {
              input: { required: { lora_name: [["other.safetensors",], {},], }, },
            },
          },),
          { status: 200, },
        );
      }
      if (target.endsWith("/prompt",)) {
        submitted = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ prompt_id: "p-3", },), { status: 200, },);
      }
      if (target.includes("/history/",)) {
        return new Response(
          JSON.stringify({ "p-3": { prompt_id: "p-3", status: "completed", outputs: {}, }, },),
          { status: 200, },
        );
      }
      throw new Error(`unexpected stub call: ${target}`,);
    }) as typeof fetch;

    const outcome = await generateComfyUI(CONFIG, {
      ...OPTS,
      lora: { name: "missing", strength: 0.7, backend: "comfyui", },
    },);

    expect(outcome.ok,).toBe(true,);
    const parsed = JSON.parse(submitted,) as { prompt: Record<string, { class_type: string }> };
    const loraNodes = Object.values(parsed.prompt,).filter((n,) => n.class_type === "LoraLoader");
    expect(loraNodes,).toHaveLength(0,);
  });
});
