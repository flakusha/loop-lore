// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/comfyui-discovery.ts — the ComfyUI probe.
 *
 * Every test swaps globalThis.fetch (the safeFetch transport) and restores it
 * afterwards. Asserts: reachable parsing (version/python/pytorch/devices),
 * unreachable transport failure, HTTP error statuses (404 from a non-ComfyUI
 * server, 503 from a loading proxy), malformed bodies, and URL joining for
 * base URLs with path prefixes.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  COMFYUI_SYSTEM_STATS_PATH,
  DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
  parseComfyUIStats,
  probeComfyUI,
} from "./comfyui-discovery";

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

describe("parseComfyUIStats", () => {
  test("extracts version, runtimes and devices", () => {
    const parsed = parseComfyUIStats({
      system: {
        comfyui_version: "0.3.45",
        python_version: "3.12.7",
        pytorch_version: "2.5.1+cu124",
      },
      devices: [{ name: "cuda:0", type: "NVIDIA GeForce RTX 4090", vram_total: 1, }, { name: "cpu", }, 7, null,],
    },);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.info.version,).toBe("0.3.45",);
      expect(parsed.info.pythonVersion,).toBe("3.12.7",);
      expect(parsed.info.pytorchVersion,).toBe("2.5.1+cu124",);
      expect(parsed.info.devices,).toEqual([
        { name: "cuda:0", type: "NVIDIA GeForce RTX 4090", },
        { name: "cpu", },
      ],);
    }
  });

  test("accepts an empty document with an empty device list", () => {
    const parsed = parseComfyUIStats({},);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.info.devices,).toEqual([],);
      expect(parsed.info.version,).toBeUndefined();
    }
  });

  test.each([[null,], [["array",],], ["string",], [42,],],)(
    "rejects a non-object body (%#)",
    (body,) => {
      const parsed = parseComfyUIStats(body,);

      expect(parsed.ok,).toBe(false,);
      if (!parsed.ok) { expect(parsed.error,).toContain("not a JSON object",); }
    },
  );

  test("ignores non-string system fields and malformed device entries", () => {
    const parsed = parseComfyUIStats({
      system: { comfyui_version: 42, },
      devices: "not-an-array",
    },);

    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) {
      expect(parsed.info.version,).toBeUndefined();
      expect(parsed.info.devices,).toEqual([],);
    }
  });
});

describe("probeComfyUI", () => {
  test("reports a reachable server with its stats", async () => {
    await withMockFetch(
      (url,) => {
        expect(url,).toBe("http://127.0.0.1:8188/system_stats",);
        return Response.json({
          system: { comfyui_version: "0.3.45", },
          devices: [{ name: "cuda:0", type: "RTX", },],
        },);
      },
      async () => {
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8188", },);

        expect(probe.reachable,).toBe(true,);
        if (probe.reachable) {
          expect(probe.version,).toBe("0.3.45",);
          expect(probe.devices,).toEqual([{ name: "cuda:0", type: "RTX", },],);
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
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8080/llama-swap///", },);

        expect(probe.reachable,).toBe(true,);
        expect(seen,).toEqual([`http://127.0.0.1:8080/llama-swap${COMFYUI_SYSTEM_STATS_PATH}`,],);
      },
    );
  });

  test("sends auth headers when provided", async () => {
    let seen: RequestInit | undefined;
    // Cast: the test only records the RequestInit safeFetch passed through.
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit,) => {
      seen = init;
      return new Response("captured", { status: 500, },);
    }) as typeof fetch;

    try {
      await probeComfyUI({
        baseUrl: "http://127.0.0.1:8188",
        headers: { Authorization: "Bearer proxy-key", },
      },);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(new Headers(seen?.headers,).get("authorization",),).toBe("Bearer proxy-key",);
  });

  test("reports a transport failure as unreachable without a status", async () => {
    await withMockFetch(
      () => Promise.reject(new Error("connection refused",),),
      async () => {
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8188", timeoutMs: 50, },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("unreachable",);
          expect(probe.detail,).toContain("connection refused",);
          expect(probe.httpStatus,).toBeUndefined();
        }
      },
    );
  });

  test("reports a 404 from a non-ComfyUI HTTP server as http-error", async () => {
    await withMockFetch(
      () => new Response("not found", { status: 404, },),
      async () => {
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8188", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) {
          expect(probe.reason,).toBe("http-error",);
          expect(probe.httpStatus,).toBe(404,);
        }
      },
    );
  });

  test("reports a 503 from a loading proxy as http-error, not as reachable", async () => {
    await withMockFetch(
      () => Response.json({ error: "model loading", }, { status: 503, },),
      async () => {
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8188", },);

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
        const probe = await probeComfyUI({ baseUrl: "http://127.0.0.1:8188", },);

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
        const probe = await probeComfyUI({ baseUrl: "   ", },);

        expect(probe.reachable,).toBe(false,);
        if (!probe.reachable) { expect(probe.reason,).toBe("invalid-base-url",); }
        expect(called,).toBe(false,);
      },
    );
  });

  test("default probe timeout is bounded", () => {
    expect(DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,).toBeLessThanOrEqual(3_000,);
  });
});
