// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/sdcpp.ts — the sd.cpp async-job
 * backend (submit + poll). Global fetch is stubbed to route job
 * submission and polling; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { generateSDCPP, } from "./sdcpp";
import { clearDiscoveryCache, } from "../lora/discovery";
import { createLogger, } from "../../logger";

// Warn paths in the fetch stack call getLogger(), which throws when the
// root logger is uninitialized — mirror the repo-wide test convention.
createLogger({ level: "error", },);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CONFIG = {
  name: "test-sdcpp",
  label: "Test sd.cpp",
  baseUrl: "http://127.0.0.1:9",
  apiFamily: "sdcpp",
  defaults: {
    width: 256,
    height: 256,
    steps: 4,
    cfgScale: 7,
    sampler: "euler",
  },
  timeout: 500,
  // Small window so the "never done" polling branch hits its deadline fast.
  generationTimeout: 30,
} satisfies ImageProviderConfig;

const OPTS = {
  prompt: "a castle",
  n: 1,
  outputFormat: "png",
};

const B64 = Buffer.from("sdcpp-image",).toString("base64",);

const SUBMIT_URL = "http://127.0.0.1:9/sdcpp/v1/img_gen";

/** Route stubbed fetch calls by method+URL path (test seam). */
function stubJobServer(handlers: {
  onSubmit?: () => unknown;
  onPoll?: () => unknown;
  failAll?: boolean;
},): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
    if (handlers.failAll) {
      throw new Error("ECONNREFUSED");
    }
    const method = (init?.method ?? "GET").toUpperCase();
    const target = String(url,);
    if (method === "POST" && target === SUBMIT_URL) {
      return new Response(JSON.stringify(handlers.onSubmit?.() ?? {},), { status: 200, },);
    }
    if (method === "GET" && target.includes("/sdcpp/v1/jobs/",)) {
      return new Response(JSON.stringify(handlers.onPoll?.() ?? {},), { status: 200, },);
    }
    throw new Error(`unexpected stub call: ${method} ${target}`);
  }) as typeof fetch;
}

describe("generateSDCPP", () => {
  it("returns a 502 failure when submission cannot connect", async () => {
    stubJobServer({ failAll: true, },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.status,).toBe(502,);
      expect(outcome.error,).toContain("sd.cpp job submission failed",);
    }
  });

  it("returns a 502 failure when the submission payload has no job id", async () => {
    stubJobServer({ onSubmit: () => ({}), },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.error,).toContain("no job id",);
    }
  });

  it("returns decoded images when the job completes", async () => {
    stubJobServer({
      onSubmit: () => ({ id: "job-1", }),
      onPoll: () => ({ status: "done", images: [B64,], }),
    },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.mimeType,).toBe("image/png",);
      expect(outcome.images[0]?.toString("utf8",),).toBe("sdcpp-image",);
    }
  });

  it("returns a 502 failure when a done job carries no images", async () => {
    stubJobServer({
      onSubmit: () => ({ id: "job-2", }),
      onPoll: () => ({ status: "done", }),
    },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.error,).toContain("returned no images",);
    }
  });

  it("returns a 502 failure when the backend reports the job failed", async () => {
    stubJobServer({
      onSubmit: () => ({ id: "job-3", }),
      onPoll: () => ({ status: "failed", error: "OutOfMemory", }),
    },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.error,).toContain("failed: OutOfMemory",);
    }
  });

  it("returns a 502 failure when polling the job fails", async () => {
    let polls = 0;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const target = String(url,);
      if (method === "POST" && target === SUBMIT_URL) {
        return new Response(JSON.stringify({ id: "job-4", },), { status: 200, },);
      }
      if (method === "GET") {
        polls++;
        throw new Error("polling socket closed");
      }
      throw new Error(`unexpected stub call: ${method} ${target}`);
    }) as typeof fetch;

    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(polls,).toBeGreaterThan(0,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.error,).toContain("job polling failed",);
    }
  });

  it("returns a 504 failure when the job never completes inside the deadline", async () => {
    stubJobServer({
      onSubmit: () => ({ id: "job-5", }),
      onPoll: () => ({ status: "running", progress: 0.5, }),
    },);
    const outcome = await generateSDCPP(CONFIG, OPTS,);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.status,).toBe(504,);
      expect(outcome.error,).toContain("timed out",);
    }
  });

  it("applies config defaults in the submission payload", async () => {
    let body = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit,) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        body = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ id: "job-6", },), { status: 200, },);
      }
      return new Response(JSON.stringify({ status: "done", images: [B64,], },), { status: 200, },);
    }) as typeof fetch;

    await generateSDCPP(CONFIG, {
      ...OPTS,
      seed: 1234,
      enableHr: true,
      hrScale: 2,
      denoisingStrength: 0.6,
    },);

    const parsed = JSON.parse(body,) as Record<string, unknown>;
    expect(parsed.prompt,).toBe("a castle",);
    expect(parsed.width,).toBe(256,);
    expect(parsed.height,).toBe(256,);
    expect(parsed.steps,).toBe(4,);
    expect(parsed.cfg_scale,).toBe(7,);
    expect(parsed.sampler,).toBe("euler",);
    expect(parsed.seed,).toBe(1234,);
    expect(parsed.batch_size,).toBe(1,);
    expect(parsed.output_format,).toBe("png",);
    expect(parsed.enable_hr,).toBe(true,);
    expect(parsed.hr_scale,).toBe(2,);
    expect(parsed.denoising_strength,).toBe(0.6,);
  });

  it("injects a discovered LoRA prefix into the submission prompt", async () => {
    clearDiscoveryCache("sd-server",);
    let body = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const target = String(url,);
      if (target.endsWith("/sd-api/v1/models",)) {
        return new Response(
          JSON.stringify({ data: [{ id: "char.safetensors", object: "model", created: 1, owned_by: "test", },], },),
          { status: 200, },
        );
      }
      if (method === "POST") {
        body = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ id: "job-lora", },), { status: 200, },);
      }
      return new Response(JSON.stringify({ status: "done", images: [B64,], },), { status: 200, },);
    }) as typeof fetch;

    const outcome = await generateSDCPP(CONFIG, {
      ...OPTS,
      lora: { name: "char", strength: 0.8, backend: "sd-server", },
    },);

    expect(outcome.ok,).toBe(true,);
    const parsed = JSON.parse(body,) as Record<string, unknown>;
    expect(parsed.prompt,).toBe("[lora:char:0.8] a castle",);
  });

  it("warns and skips injection for an unknown LoRA", async () => {
    clearDiscoveryCache("sd-server",);
    let body = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const target = String(url,);
      if (target.endsWith("/sd-api/v1/models",)) {
        return new Response(
          JSON.stringify({ data: [{ id: "other.safetensors", object: "model", created: 1, owned_by: "test", },], },),
          { status: 200, },
        );
      }
      if (method === "POST") {
        body = typeof init?.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ id: "job-lora2", },), { status: 200, },);
      }
      return new Response(JSON.stringify({ status: "done", images: [B64,], },), { status: 200, },);
    }) as typeof fetch;

    const outcome = await generateSDCPP(CONFIG, {
      ...OPTS,
      lora: { name: "missing", strength: 0.5, backend: "sd-server", },
    },);

    expect(outcome.ok,).toBe(true,);
    const parsed = JSON.parse(body,) as Record<string, unknown>;
    expect(parsed.prompt,).toBe("a castle",);
  });
});
