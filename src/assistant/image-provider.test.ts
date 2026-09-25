// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/assistant/image-provider.ts — resolution of the configured
 * image-generation backend (ComfyUI / sd-server / none). Pure-function tests;
 * no ComfyUI server is required.
 *
 * Configs are built with `createConfigSchema().defaults` then mutated inline
 * (matches the hot-reload.test.ts mocking pattern).
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Config, ImageProviderConfig, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { ComfyUIClient, } from "../generation/providers/comfyui";
import { createLogger, } from "../logger";
import { buildImageWorkflow, resolveImageProvider, } from "./image-provider";

/** Minimum viable ImageProviderConfig for the resolver to accept. */
function sdProvider(partial: Partial<ImageProviderConfig>,): ImageProviderConfig {
  return {
    name: partial.name ?? "stub-sd",
    label: partial.label ?? "Stub SD",
    baseUrl: partial.baseUrl ?? "http://127.0.0.1:8188",
    apiFamily: partial.apiFamily ?? "comfyui",
    purpose: partial.purpose ?? "generate",
    defaults: {
      width: 512,
      height: 512,
      steps: 20,
      cfgScale: 7,
      sampler: "euler",
      ...(partial.defaults ?? {}),
    },
    timeout: partial.timeout ?? 30_000,
    generationTimeout: partial.generationTimeout ?? 30_000,
  };
}

/** Build a Config snapshot the resolver understands. */
function makeConfig(overrides: Partial<Config> = {},): Config {
  const base = structuredClone(createConfigSchema().defaults,) as unknown as Config;
  return { ...base, ...overrides, } as Config;
}

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("resolveImageProvider", () => {
  it("returns backend: 'none' with reason 'no provider configured' when config is undefined", () => {
    const result = resolveImageProvider(undefined,);
    expect(result.backend,).toBe("none",);
    if (result.backend === "none") {
      expect(result.reason,).toBe("no provider configured",);
    }
  });

  it("returns backend: 'none' with reason 'no provider configured' when providers.sd is empty", () => {
    const cfg = makeConfig({
      generation: {
        ...((makeConfig().generation as unknown as object) ?? {}),
        providers: { ...((makeConfig().generation.providers as unknown as object) ?? {}), sd: [], },
      } as never,
    },);
    const result = resolveImageProvider(cfg,);
    expect(result.backend,).toBe("none",);
    if (result.backend === "none") {
      expect(result.reason,).toBe("no provider configured",);
    }
  });

  it("returns backend: 'comfyui' with a ComfyUIClient when an apiFamily: comfyui provider is configured", () => {
    const cfg = makeConfig({},);
    // Inject the sd array onto the resolved Config snapshot.
    (cfg.generation.providers as unknown as { sd?: ImageProviderConfig[] }).sd = [
      sdProvider({
        name: "local-comfy",
        apiFamily: "comfyui",
        baseUrl: "http://127.0.0.1:8188",
        purpose: "generate",
      },),
    ];
    const result = resolveImageProvider(cfg,);
    expect(result.backend,).toBe("comfyui",);
    if (result.backend !== "none") {
      expect(result.client,).toBeInstanceOf(ComfyUIClient,);
      expect(result.config.apiFamily,).toBe("comfyui",);
      expect(result.config.name,).toBe("local-comfy",);
    }
  });

  it("returns backend: 'sd-server' for apiFamily: 'sdapi' (AUTOMATIC1111 sd-server HTTP)", () => {
    const cfg = makeConfig({},);
    (cfg.generation.providers as unknown as { sd?: ImageProviderConfig[] }).sd = [
      sdProvider({ name: "a1111", apiFamily: "sdapi", baseUrl: "http://127.0.0.1:7860", purpose: "generate", },),
    ];
    const result = resolveImageProvider(cfg,);
    expect(result.backend,).toBe("sd-server",);
    if (result.backend !== "none") {
      expect(result.client,).toBeInstanceOf(ComfyUIClient,);
      expect(result.config.apiFamily,).toBe("sdapi",);
    }
  });

  it("returns backend: 'sd-server' for apiFamily: 'sdcpp' (sd.cpp native)", () => {
    const cfg = makeConfig({},);
    (cfg.generation.providers as unknown as { sd?: ImageProviderConfig[] }).sd = [
      sdProvider({ name: "sdcpp-local", apiFamily: "sdcpp", baseUrl: "http://127.0.0.1:7861", purpose: "generate", },),
    ];
    const result = resolveImageProvider(cfg,);
    expect(result.backend,).toBe("sd-server",);
    if (result.backend !== "none") {
      expect(result.config.apiFamily,).toBe("sdcpp",);
    }
  });

  it("falls through to the first provider when no provider matches purpose: 'generate'", () => {
    const cfg = makeConfig({},);
    (cfg.generation.providers as unknown as { sd?: ImageProviderConfig[] }).sd = [
      sdProvider({ name: "edit-only", apiFamily: "comfyui", purpose: "edit", baseUrl: "http://127.0.0.1:8188", },),
    ];
    const result = resolveImageProvider(cfg,);
    // pickSdProvider with no generate-match falls back to the first entry.
    expect(result.backend,).toBe("comfyui",);
  });

  it("returns backend: 'none' with reason 'unsupported apiFamily' when only 'openai' is configured", () => {
    const cfg = makeConfig({},);
    (cfg.generation.providers as unknown as { sd?: ImageProviderConfig[] }).sd = [
      sdProvider({ name: "openai-img", apiFamily: "openai", baseUrl: "http://127.0.0.1:9999", purpose: "generate", },),
    ];
    const result = resolveImageProvider(cfg,);
    expect(result.backend,).toBe("none",);
    if (result.backend === "none") {
      expect(result.reason,).toBe("unsupported apiFamily",);
    }
  });
});

describe("buildImageWorkflow", () => {
  it("produces a single-node ComfyUIWorkflow with the requested prompt", async () => {
    const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188", },);
    const workflow = await buildImageWorkflow("a serene mountain", undefined, client,);
    expect("1" in workflow,).toBe(true,);
    const node = workflow["1"]!;
    expect(node.class_type,).toBe("PositivePromptStub",);
    expect(node.inputs.prompt,).toBe("a serene mountain",);
    expect(typeof node.inputs.seed,).toBe("number",);
  });
});
