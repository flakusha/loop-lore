// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/sdcpp-discovery.ts — the sd.cpp probe.
 *
 * Every test swaps globalThis.fetch (the safeFetch transport) and restores it
 * afterwards. Asserts: reachable parsing (version/build_info/runtime/models),
 * unreachable transport failure, HTTP error statuses (404 from a non-sd.cpp
 * server, 503 while loading), malformed bodies, and URL joining for base
 * URLs with path prefixes.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
  parseSdCppCapabilities,
  probeSdCpp,
  SDCPP_CAPABILITIES_PATH,
} from "./sdcpp-discovery";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

/** Swap globalThis.fetch for the duration of `fn`. */
async function withMockFetch(
  handler: (url: string,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = (async (url: string | URL | Request,) => handler(String(url,),)) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("parseSdCppCapabilities", () => {
  test("extracts version, runtime state, models and server error", () => {
    const parsed = parseSdCppCapabilities({
      version: "1.2.3",
      runtime: {
        state: "ready",
        error: null,
        models: { diffusion_model: "checkpoints/a.gguf", vae: "vae/b.safetensors", },
      },
    },);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.info.version,).toBe("1.2.3",);
      expect(parsed.info.state,).toBe("ready",);
      expect(parsed.info.models,).toEqual(["checkpoints/a.gguf", "vae/b.safetensors",],);
      expect(parsed.info.serverError,).toBeUndefined();
    }
  });

  test("falls back to build_info.build_number for the version", () => {
    const parsed = parseSdCppCapabilities({ build_info: { build_number: 42, }, },);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) { expect(parsed.info.version,).toBe("42",); }
  });

  test("accepts an empty document with an empty model list", () => {
    const parsed = parseSdCppCapabilities({},);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.info.models,).toEqual([],);
      expect(parsed.info.version,).toBeUndefined();
      expect(parsed.info.state,).toBeUndefined();
    }
  });

  test.each([[null,], [["array",],], ["string",], [42,],],)(
    "rejects a non-object body (%#)",
    (body,) => {
      const parsed = parseSdCppCapabilities(body,);

      expect(parsed.ok,).toBe(false,);
      if (!parsed.ok) { expect(parsed.error,).toContain("not a JSON object",); }
    },
  );

  test("ignores non-string runtime model entries", () => {
    const parsed = parseSdCppCapabilities({ runtime: { models: ["keep.gguf", 7, null, {},], }, },);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) { expect(parsed.info.models,).toEqual(["keep.gguf",],); }
  });
});

describe("probeSdCpp", () => {
  test("reports a reachable server with its capabilities", async () => {
    await withMockFetch(
      (url,) => {
        expect(url,).toBe("http://127.0.0.1:9010/sdcpp/v1/capabilities",);
        return Response.json({
          version: "test-build",
          runtime: { state: "ready", models: { diffusion_model: "checkpoints/m.gguf", }, },
        },);
      },
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:9010", },);

        expect(probe.reachable,).toBe(true,);
        if (probe.reachable) {
          expect(probe.version,).toBe("test-build",);
          expect(probe.state,).toBe("ready",);
          expect(probe.models,).toEqual(["checkpoints/m.gguf",],);
          expect(probe.latencyMs,).toBeGreaterThanOrEqual(0,);
        }
      },
    );
  });

  test("joins a base URL with a path prefix and trailing slashes", async () => {
    const seen: string[] = [];
    await withMockFetch(
      (url,) => {
        seen.push(url,);
        return Response.json({},);
      },
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:8080/llama-swap///", },);

        expect(probe.reachable,).toBe(true,);
        expect(seen,).toEqual([`http://127.0.0.1:8080/llama-swap${SDCPP_CAPABILITIES_PATH}`,],);
      },
    );
  });

  test("reports a transport failure as unreachable without a status", async () => {
    await withMockFetch(
      () => Promise.reject(new Error("connection refused",),),
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:9010", timeoutMs: 50, },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("unreachable",);
          expect(probe.detail,).toContain("connection refused",);
          expect(probe.httpStatus,).toBeUndefined();
        }
      },
    );
  });

  test("reports a 404 from a non-sd.cpp HTTP server as http-error", async () => {
    await withMockFetch(
      () => new Response("not found", { status: 404, },),
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:9010", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("http-error",);
          expect(probe.httpStatus,).toBe(404,);
        }
      },
    );
  });

  test("reports a 503 (model not loaded) as http-error, not as reachable", async () => {
    await withMockFetch(
      () => Response.json({ error: "No model is loaded", code: "model_not_loaded", }, { status: 503, },),
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:9010", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("http-error",);
          expect(probe.httpStatus,).toBe(503,);
        }
      },
    );
  });

  test("reports a non-JSON 200 body as malformed-response", async () => {
    await withMockFetch(
      () => new Response("<html>not json</html>", { status: 200, },),
      async () => {
        const probe = await probeSdCpp({ baseUrl: "http://127.0.0.1:9010", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("malformed-response",);
          expect(probe.detail.length,).toBeGreaterThan(0,);
        }
      },
    );
  });

  test("rejects a blank base URL without touching the network", async () => {
    let called = false;
    await withMockFetch(
      () => {
        called = true;
        return Response.json({},);
      },
      async () => {
        const probe = await probeSdCpp({ baseUrl: "   ", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) { expect(probe.reason,).toBe("invalid-base-url",); }
        expect(called,).toBe(false,);
      },
    );
  });

  test("default probe timeout is bounded", () => {
    expect(DEFAULT_SDCPP_PROBE_TIMEOUT_MS,).toBeLessThanOrEqual(3_000,);
  });
});
