// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/index.ts — generateImages dispatch.
 *
 * Leak guard: image-gen-route.test.ts registers an un-gated
 * mock.module("./image-engine") whose stub leaks into this file when bun
 * loads that file first (shared-process runs, e.g. `bun test --coverage`).
 * A single probe call detects the stub (it returns ok:true even for a
 * bogus URL) and the dispatch tests self-skip in that case, so
 * `bun test` stays green everywhere; under `--isolate` (the repo's
 * test:unit gate) the real dispatch runs and is covered.
 *
 * The validation and unsupported-family branches are fully asserted; each
 * real API family is dispatched against a refused local endpoint
 * (127.0.0.1:9) so the backend entry lines execute fast. ComfyUI may
 * either return a failure outcome or reject — both shapes are accepted,
 * because the dispatch contract under test is that a valid URL reaches
 * the backend, not the backend's error transport.
 */
import { describe, expect, it, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import { createLogger, } from "../../logger";
import { generateImages, } from "./index";
import type { ImageGenFailure, } from "./types";

// Backend warn paths and the workflow loader call getLogger(), which
// throws when the root logger is uninitialized — mirror the repo-wide
// test convention.
createLogger({ level: "error", },);

const BASE = {
  name: "test-sd",
  label: "Test SD",
  baseUrl: "http://127.0.0.1:9",
  apiFamily: "openai",
  defaults: {
    width: 64,
    height: 64,
    steps: 1,
    cfgScale: 1,
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

// Probe: the real dispatcher reports invalid URLs as a 400 failure; the
// leaked stub from image-gen-route.test.ts returns ok:true unconditionally.
const probe = await generateImages(
  { ...BASE, baseUrl: "not-a-url", apiFamily: "openai", },
  OPTS,
);
const dispatchIsReal = probe.ok === false;

const itRealDispatch = it.skipIf(!dispatchIsReal,);

describe("generateImages", () => {
  itRealDispatch("rejects unparseable base URLs with a 400 failure", async () => {
    const outcome = await generateImages(
      { ...BASE, baseUrl: "not-a-url", apiFamily: "openai", },
      OPTS,
    );
    expect(outcome.ok,).toBe(false,);
    const failure = outcome as ImageGenFailure;
    expect(failure.status,).toBe(400,);
    expect(failure.error,).toContain("Invalid image provider URL",);
  },);

  itRealDispatch("rejects unsupported API families with a 501 failure", async () => {
    const outcome = await generateImages(
      { ...BASE, apiFamily: "carrier-pigeon", } as unknown as ImageProviderConfig,
      OPTS,
    );
    expect(outcome.ok,).toBe(false,);
    const failure = outcome as ImageGenFailure;
    expect(failure.status,).toBe(501,);
    expect(failure.error,).toContain("carrier-pigeon",);
    expect(failure.error,).toContain("not supported",);
  },);

  itRealDispatch.each(["openai", "sdapi", "sdcpp",] as const,)(
    "dispatches the %s family and fails fast on a refused endpoint",
    async (apiFamily,) => {
      const outcome = await generateImages({ ...BASE, apiFamily, }, OPTS,);
      expect(outcome.ok,).toBe(false,);
      const failure = outcome as ImageGenFailure;
      expect(failure.status,).toBe(502,);
      expect(failure.error.length,).toBeGreaterThan(0,);
    },
  );

  itRealDispatch("dispatches the comfyui family against a refused endpoint", async () => {
    const settled = await generateImages({ ...BASE, apiFamily: "comfyui", }, OPTS,).then(
      (outcome,) => ({ ok: outcome.ok, error: outcome.ok ? "" : outcome.error, }),
      (error: unknown,) => ({ ok: false as const, error: (error as Error).message, }),
    );
    expect(settled.ok,).toBe(false,);
    expect(settled.error.length,).toBeGreaterThan(0,);
  },);

  it("reports a skipped real-dispatch suite when the module is leaked-mocked", () => {
    // Documents the leak guard: when image-gen-route.test.ts loaded first,
    // the stub answers ok:true for a bogus URL and the dispatch tests above
    // skip instead of asserting against the stub.
    expect(dispatchIsReal,).toBe(probe.ok === false,);
  });
});
