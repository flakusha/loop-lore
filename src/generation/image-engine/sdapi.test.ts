// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/sdapi.ts — the SD WebUI txt2img
 * backend. Global fetch is stubbed; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { createLogger, } from "../../logger";
import { generateSDAPI, } from "./sdapi";

// Warn paths in the fetch stack call getLogger(), which throws when the
// root logger is uninitialized — mirror the repo-wide test convention.
createLogger({ level: "error", },);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

const CONFIG = {
  name: "test-sdapi",
  label: "Test SD WebUI",
  baseUrl: "http://127.0.0.1:9/",
  apiFamily: "sdapi",
  defaults: {
    width: 256,
    height: 256,
    steps: 4,
    cfgScale: 7,
    sampler: "Euler a",
    negativePrompt: "lowres",
  },
  timeout: 500,
  generationTimeout: 500,
} satisfies ImageProviderConfig;

const B64 = Buffer.from("sdapi-image",).toString("base64",);

describe("generateSDAPI", () => {
  it("returns a 502 failure when the endpoint is unreachable", async () => {
    const outcome = await generateSDAPI(CONFIG, {
      prompt: "a castle",
      n: 1,
      outputFormat: "png",
    },);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.status,).toBe(502,);
      expect(outcome.error,).toContain("Image generation failed",);
    }
  });

  it("decodes returned images and trims trailing slashes from the base URL", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string | URL | Request,) => {
      capturedUrl = String(url,);
      return new Response(JSON.stringify({ images: [B64,], },), { status: 200, },);
    }) as typeof fetch;

    const outcome = await generateSDAPI(CONFIG, {
      prompt: "a castle",
      n: 1,
      outputFormat: "png",
    },);

    expect(capturedUrl,).toBe("http://127.0.0.1:9/sdapi/v1/txt2img",);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.mimeType,).toBe("image/png",);
      expect(outcome.images[0]?.toString("utf8",),).toBe("sdapi-image",);
    }
  });

  it("applies config defaults for sampling parameters", async () => {
    let body = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit,) => {
      body = typeof init?.body === "string" ? init.body : "";
      return new Response(JSON.stringify({ images: [], },), { status: 200, },);
    }) as typeof fetch;

    await generateSDAPI(CONFIG, {
      prompt: "a castle",
      n: 2,
      outputFormat: "png",
      steps: 9,
      cfgScale: 4.5,
    },);

    const parsed = JSON.parse(body,) as Record<string, unknown>;
    expect(parsed.prompt,).toBe("a castle",);
    expect(parsed.negative_prompt,).toBe("lowres",);
    expect(parsed.steps,).toBe(9,);
    expect(parsed.cfg_scale,).toBe(4.5,);
    expect(parsed.sampler_name,).toBe("Euler a",);
    expect(parsed.batch_size,).toBe(2,);
  });
});
