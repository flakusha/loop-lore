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
import { afterEach, describe, expect, it, } from "bun:test";
import type { Config, ImageProviderConfig, } from "../../config/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { ByoKeyDecryptError, userApiKeyResolver, } from "../providers/user-api-key";
import { comfyUiSkipAttempt, generateImages, generateImagesWithFailover, sdCppSkipAttempt, } from "./index";
import type { FailoverAttempt, ImageGenFailure, } from "./types";

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

// Every case below uses `not-a-url` base URLs, so each attempt fails at the
// URL guard (400) without touching the network: the failover walk itself is
// what is under test, not any backend's error transport.
describe("generateImagesWithFailover", () => {
  const failing = (name: string, purpose: ImageProviderConfig["purpose"],): ImageProviderConfig => ({
    ...BASE,
    name,
    purpose,
    baseUrl: "not-a-url",
  });

  itRealDispatch("returns a 501 failure when no provider is configured", async () => {
    const outcome = await generateImagesWithFailover(undefined, "generate", OPTS,);

    expect(outcome.ok,).toBe(false,);
    expect((outcome as ImageGenFailure).status,).toBe(501,);
    expect((outcome as ImageGenFailure).error,).toContain("No image generation provider configured",);
  },);

  itRealDispatch("attempts the purpose-ordered list once each and returns the LAST failure", async () => {
    const providers = [
      failing("edit-only", "edit",),
      failing("gen-a", "generate",),
      failing("gen-b", "generate",),
    ];

    const asked: string[] = [];

    const outcome = await generateImagesWithFailover(providers, "generate", OPTS, async (name,) => {
      asked.push(name,);
      return undefined;
    },);

    expect(asked,).toEqual(["gen-a", "gen-b", "edit-only",],);
    expect(outcome.ok,).toBe(false,);
    expect((outcome as ImageGenFailure).status,).toBe(400,);
    expect((outcome as ImageGenFailure).error,).toContain("Invalid image provider URL",);
  },);

  itRealDispatch("honors the caller key on the first candidate, per-provider after that", async () => {
    const providers = [failing("gen-a", "generate",), failing("gen-b", "generate",),];
    const asked: string[] = [];

    const outcome = await generateImagesWithFailover(
      providers,
      "generate",
      { ...OPTS, apiKey: "caller-key", },
      async (name,) => {
        asked.push(name,);
        return `resolved-${name}`;
      },
    );

    // The caller's key is spent on the first backend only; a key stored for
    // backend A is never handed to backend B (double-billing guard).
    expect(asked,).toEqual(["gen-b",],);
    expect(outcome.ok,).toBe(false,);
  },);

  itRealDispatch("a single configured provider behaves like generateImages", async () => {
    const provider = failing("only", "generate",);

    const viaFailover = await generateImagesWithFailover([provider,], "generate", OPTS,);
    const direct = await generateImages(provider, OPTS,);

    // The failover walk records per-candidate attempts on its failures; the
    // direct dispatch carries none.
    expect(direct.ok,).toBe(false,);
    const expected = {
      ...direct,
      attempts: [{
        provider: "only",
        outcome: "failed",
        reason: (direct as ImageGenFailure).error,
        status: (direct as ImageGenFailure).status,
      },],
    } as ImageGenFailure;

    expect(viaFailover,).toEqual(expected,);
  },);

  it("refuses an invalid workflow graph before any provider executes", async () => {
    // An object is a graph, not a library name: the shared gate rejects the
    // empty graph with a 400 failure. attemptCandidate records EVERY provider
    // execution on `attempts`, so its absence proves no backend was reached.
    const outcome = await generateImagesWithFailover(
      [{ ...BASE, name: "gen-a", },],
      "generate",
      { ...OPTS, workflow: {} as unknown as string, },
    );

    expect(outcome.ok,).toBe(false,);
    const failed = outcome as ImageGenFailure;
    expect(failed.status,).toBe(400,);
    expect(failed.error,).toContain("Invalid workflow graph",);
    expect(failed.attempts,).toBeUndefined();
  });
});

describe("generateImagesWithFailover BYO keys", () => {
  const byoFailing = (name: string,): ImageProviderConfig => ({ ...BASE, name, baseUrl: "not-a-url", });

  it("a corrupt stored image key fails closed — the operator key is never billed", async () => {
    const env = await createTestDb();
    try {
      await insertUsers(env.db, "byok-user", "BYOK User", { id: "byok-user", },);
      await env.db.insertInto("user_api_keys",).values({
        id: crypto.randomUUID(),
        user_id: "byok-user",
        provider_name: "gen-a",
        api_key_encrypted: "corrupt-image-ciphertext",
      },).execute();

      const config = {
        byoKey: { enabled: true, encryptionKey: "engine-byok-secret", },
        generation: { providers: {}, },
      } as unknown as Config;

      const resolve = userApiKeyResolver({ userId: "byok-user", config, db: env.db, },);

      const providers = [byoFailing("gen-a",), byoFailing("gen-b",),];
      await expect(
        generateImagesWithFailover(providers, "generate", OPTS, resolve,),
      ).rejects.toThrow(ByoKeyDecryptError,);
    } finally {
      await destroyTestDb(env,);
    }
  });

  it("with no stored key the resolver yields undefined and the walk proceeds", async () => {
    const env = await createTestDb();
    try {
      const config = {
        byoKey: { enabled: true, encryptionKey: "engine-byok-secret", },
        generation: { providers: {}, },
      } as unknown as Config;

      const resolve = userApiKeyResolver({ userId: "byok-user", config, db: env.db, },);

      // Un-gated on purpose: no candidate is dispatched past the URL guard, so
      // this holds for the real dispatcher AND the stub.
      const outcome = await generateImagesWithFailover(
        [byoFailing("gen-a",),],
        "generate",
        OPTS,
        resolve,
      );

      // The backend attempt ran (URL-guard 400); the undefined resolver result
      // means its static apiKey is what it received.
      expect(outcome.ok,).toBe(false,);
      expect((outcome as ImageGenFailure).status,).toBe(400,);
    } finally {
      await destroyTestDb(env,);
    }
  });
});

// ── sd.cpp discovery gate (TASK-1-0-0-gap-sd-cpp) ─────────────
//
// sd.cpp candidates pass a capabilities probe before any generation attempt:
// an undiscovered/unreachable instance is SKIPPED with a structured reason so
// the walk continues to the next backend instead of failing hard.

describe("generateImagesWithFailover sd.cpp discovery gate", () => {
  const originalFetch = globalThis.fetch;

  const sdcppProvider = (name: string, baseUrl = "http://127.0.0.1:9010",): ImageProviderConfig => ({
    ...BASE,
    name,
    apiFamily: "sdcpp",
    baseUrl,
  });

  const comfyProvider = (name: string,): ImageProviderConfig => ({
    ...BASE,
    name,
    apiFamily: "comfyui",
    baseUrl: "http://127.0.0.1:8188",
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  itRealDispatch("skips an unreachable sd.cpp candidate and falls through to the next backend", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request,) => {
      const url = String(input instanceof Request ? input.url : input,);
      requested.push(url,);
      // The ComfyUI candidate passes its own discovery gate (/system_stats)
      // before its generation attempt runs.
      if (url.endsWith("/system_stats",)) { return Response.json({},); }
      if (url.endsWith("/object_info",)) { return new Response("boom", { status: 500, },); }
      throw new Error("connection refused",);
    }) as typeof fetch;

    const outcome = await generateImagesWithFailover(
      [sdcppProvider("sd-down",), comfyProvider("comfy-main",),],
      "generate",
      OPTS,
    );

    // The dead sd.cpp instance was skipped (no img_gen attempt); the walk
    // still reached the ComfyUI backend.
    expect(outcome.ok,).toBe(false,);
    const failure = outcome as ImageGenFailure;
    expect(failure.attempts,).toHaveLength(2,);
    expect(failure.attempts![0]!.provider,).toBe("sd-down",);
    expect(failure.attempts![0]!.outcome,).toBe("skipped",);
    expect(failure.attempts![0]!.reason,).toContain("unreachable",);
    expect(failure.attempts![1]!.provider,).toBe("comfy-main",);
    expect(failure.attempts![1]!.outcome,).toBe("failed",);
    expect(requested.some((url,) => url.endsWith("/sdcpp/v1/img_gen",)),).toBe(false,);
  },);

  itRealDispatch("records the probe http status when the endpoint is not sd.cpp", async () => {
    globalThis.fetch = (async (input: string | URL | Request,) => {
      const url = String(input instanceof Request ? input.url : input,);
      if (url.endsWith("/sdcpp/v1/capabilities",)) { return new Response("not found", { status: 404, },); }
      throw new Error(`unexpected fetch ${url}`,);
    }) as typeof fetch;

    const outcome = await generateImagesWithFailover([sdcppProvider("not-sdcpp",),], "generate", OPTS,);

    expect(outcome.ok,).toBe(false,);
    const failure = outcome as ImageGenFailure;
    expect(failure.status,).toBe(502,);
    expect(failure.error,).toContain("No reachable image generation provider",);
    expect(failure.attempts,).toEqual(
      [{
        provider: "not-sdcpp",
        outcome: "skipped",
        reason: expect.stringContaining("http-error",),
        status: 404,
      },] satisfies FailoverAttempt[],
    );
  },);

  // ── ComfyUI discovery gate ────────────────────────────────────
  //
  // ComfyUI candidates pass the same family of discovery gate as sd.cpp, against
  // the native /system_stats endpoint: an unreachable instance is SKIPPED with a
  // structured reason and the walk continues.

  describe("generateImagesWithFailover ComfyUI discovery gate", () => {
    const originalFetch = globalThis.fetch;

    const comfy = (name: string, baseUrl = "http://127.0.0.1:8188",): ImageProviderConfig => ({
      ...BASE,
      name,
      apiFamily: "comfyui",
      // Same purpose fit as the sdcpp candidates so listSdProviders keeps the
      // given order (purpose-less providers sort last).
      purpose: "generate",
      baseUrl,
    });

    const failing = (name: string, purpose: ImageProviderConfig["purpose"],): ImageProviderConfig => ({
      ...BASE,
      name,
      purpose,
      baseUrl: "not-a-url",
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    },);

    itRealDispatch("skips an unreachable ComfyUI candidate and falls through to the next backend", async () => {
      const requested: string[] = [];
      (globalThis as Record<string, unknown>).fetch = async (input: string | URL | Request,) => {
        const url = String(input instanceof Request ? input.url : input,);
        requested.push(url,);
        throw new Error("connection refused",);
      };

      const outcome = await generateImagesWithFailover(
        [comfy("comfy-down",), failing("gen-openai", "generate",),],
        "generate",
        OPTS,
      );

      // The dead ComfyUI instance was skipped (no prompt attempt); the walk
      // still attempted the next backend.
      expect(outcome.ok,).toBe(false,);
      const failure = outcome as ImageGenFailure;
      expect(failure.attempts,).toHaveLength(2,);
      expect(failure.attempts![0]!.provider,).toBe("comfy-down",);
      expect(failure.attempts![0]!.outcome,).toBe("skipped",);
      expect(failure.attempts![0]!.reason,).toContain("unreachable",);
      expect(failure.attempts![1]!.provider,).toBe("gen-openai",);
      expect(failure.attempts![1]!.outcome,).toBe("failed",);
      expect(requested.some((url,) => url.endsWith("/prompt",)),).toBe(false,);
      expect(requested.some((url,) => url.endsWith("/system_stats",)),).toBe(true,);
    },);

    itRealDispatch("records the probe http status when the endpoint is not ComfyUI", async () => {
      globalThis.fetch = (async (input: string | URL | Request,) => {
        const url = String(input instanceof Request ? input.url : input,);
        if (url.endsWith("/system_stats",)) { return new Response("not found", { status: 404, },); }
        throw new Error(`unexpected fetch ${url}`,);
      }) as typeof fetch;

      const outcome = await generateImagesWithFailover([comfy("not-comfy",),], "generate", OPTS,);

      expect(outcome.ok,).toBe(false,);
      const failure = outcome as ImageGenFailure;
      expect(failure.status,).toBe(502,);
      expect(failure.error,).toContain("No reachable image generation provider",);
      expect(failure.attempts,).toEqual(
        [{
          provider: "not-comfy",
          outcome: "skipped",
          reason: expect.stringContaining("http-error",),
          status: 404,
        },] satisfies FailoverAttempt[],
      );
    },);

    itRealDispatch("dispatches a healthy ComfyUI candidate after a passing probe", async () => {
      const requested: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request,) => {
        const url = String(input instanceof Request ? input.url : input,);
        requested.push(url,);
        if (url.endsWith("/system_stats",)) { return Response.json({},); }
        throw new Error(`unexpected fetch ${url}`,);
      }) as typeof fetch;

      const outcome = await generateImagesWithFailover([comfy("comfy-ok",),], "generate", OPTS,);

      // The probe passed, so the walk paid a real generation attempt (which
      // fails against the mock transport) — recorded as failed, not skipped.
      expect(outcome.ok,).toBe(false,);
      const failure = outcome as ImageGenFailure;
      expect(failure.attempts,).toHaveLength(1,);
      expect(failure.attempts![0]!.provider,).toBe("comfy-ok",);
      expect(failure.attempts![0]!.outcome,).toBe("failed",);
      expect(requested.some((url,) => url.endsWith("/system_stats",)),).toBe(true,);
    },);
  });

  itRealDispatch("dispatches a healthy sd.cpp candidate without probing later candidates", async () => {
    const IMG_B64 = Buffer.from("png-data",).toString("base64",);
    let comfyProbed = false;
    globalThis.fetch = (async (input: string | URL | Request,) => {
      const url = String(input instanceof Request ? input.url : input,);
      if (url.endsWith("/sdcpp/v1/capabilities",)) {
        return Response.json({ version: "t", runtime: { state: "ready", }, },);
      }

      if (url.endsWith("/sdcpp/v1/img_gen",)) { return Response.json({ id: "j1", },); }
      if (url.endsWith("/sdcpp/v1/jobs/j1",)) {
        return Response.json({ status: "done", images: [IMG_B64,], },);
      }

      if (url.endsWith("/object_info",)) {
        comfyProbed = true;
        return new Response("boom", { status: 500, },);
      }

      throw new Error(`unexpected fetch ${url}`,);
    }) as typeof fetch;

    const outcome = await generateImagesWithFailover(
      [sdcppProvider("sd-ok",), comfyProvider("comfy-main",),],
      "generate",
      OPTS,
    );

    expect(outcome.ok,).toBe(true,);
    expect((outcome as { attempts?: FailoverAttempt[] }).attempts,).toBeUndefined();
    expect(comfyProbed,).toBe(false,);
  },);

  itRealDispatch("sdCppSkipAttempt and comfyUiSkipAttempt report unreachable backends directly", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused",);
    }) as unknown as typeof fetch;

    const sd = await sdCppSkipAttempt(
      { ...BASE, name: "sd-direct", apiFamily: "sdcpp", baseUrl: "http://127.0.0.1:9", timeout: 250, },
      undefined,
    );

    const comfy = await comfyUiSkipAttempt(
      { ...BASE, name: "comfy-direct", apiFamily: "comfyui", baseUrl: "http://127.0.0.1:9", timeout: 250, },
      undefined,
    );

    expect(sd?.outcome,).toBe("skipped",);
    expect(sd?.provider,).toBe("sd-direct",);
    expect(comfy?.outcome,).toBe("skipped",);
    expect(comfy?.provider,).toBe("comfy-direct",);
  },);
});
