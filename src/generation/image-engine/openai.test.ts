// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/openai.ts — the OpenAI-compatible
 * images backend. Global fetch is stubbed; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { generateOpenAI, } from "./openai";
import { createLogger, } from "../../logger";

// Warn paths in the fetch stack call getLogger(), which throws when the
// root logger is uninitialized — mirror the repo-wide test convention.
createLogger({ level: "error", },);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CONFIG = {
  name: "test-openai",
  label: "Test OpenAI Images",
  baseUrl: "http://127.0.0.1:9",
  apiFamily: "openai",
  defaults: {
    width: 256,
    height: 256,
    steps: 4,
    cfgScale: 7,
    sampler: "euler",
  },
  timeout: 500,
  generationTimeout: 500,
} satisfies ImageProviderConfig;

const B64 = Buffer.from("fake-png-bytes",).toString("base64",);

/** Swap global fetch for a canned JSON response (test seam). */
function stubFetchJson(payload: unknown,): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload,), {
      status: 200,
      headers: { "Content-Type": "application/json", },
    },)) as unknown as typeof fetch;
}

describe("generateOpenAI", () => {
  it("returns a 502 failure when the endpoint is unreachable", async () => {
    const outcome = await generateOpenAI(CONFIG, {
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

  it("decodes base64 images and reports image/png for the default format", async () => {
    stubFetchJson({ data: [{ b64_json: B64, },], },);
    const outcome = await generateOpenAI(CONFIG, {
      prompt: "a castle",
      n: 1,
      outputFormat: "png",
    },);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.mimeType,).toBe("image/png",);
      expect(outcome.images,).toHaveLength(1,);
      expect(outcome.images[0]?.toString("utf8",),).toBe("fake-png-bytes",);
    }
  });

  it("reports image/jpeg when jpeg output is requested", async () => {
    stubFetchJson({ data: [{ b64_json: B64, }, { b64_json: B64, },], },);
    const outcome = await generateOpenAI(CONFIG, {
      prompt: "a castle",
      n: 2,
      outputFormat: "jpeg",
    },);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.mimeType,).toBe("image/jpeg",);
      expect(outcome.images,).toHaveLength(2,);
    }
  });

  it("sends the negative prompt when provided", async () => {
    let captured: { url: string; body: string } | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      captured = {
        url: String(url,),
        body: typeof init?.body === "string" ? init.body : "",
      };
      return new Response(JSON.stringify({ data: [], },), { status: 200, },);
    }) as typeof fetch;

    await generateOpenAI(CONFIG, {
      prompt: "a castle",
      n: 1,
      outputFormat: "png",
      negativePrompt: "blurry",
    },);

    expect(captured?.url,).toBe("http://127.0.0.1:9/v1/images/generations",);
    const parsed = JSON.parse(captured?.body ?? "{}",) as Record<string, unknown>;
    expect(parsed.prompt,).toBe("a castle",);
    expect(parsed.negative_prompt,).toBe("blurry",);
    expect(parsed.output_format,).toBe("png",);
  });
});
