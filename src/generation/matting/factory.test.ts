// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting provider factory tests - backend resolution matrix over the
 * `generation.matting` config section and honkbox's cached capabilities.
 * Pure construction: no network, no global fetch/env stubs.
 * Resource contract: every test owns only in-memory config/probe values —
 * no files, ports, DB, env vars; order-independent. The honkbox wire-shape
 * test stubs `globalThis.fetch` and restores it in a `finally` block.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import {
  type HonkboxProbeResult,
  type HonkboxProbeSuccess,
  parseHonkboxCapabilities,
} from "../../integrations/honkbox/capabilities";
import { resolveMattingProvider, } from "./factory";

/** Minimal config cast - factory only reads generation.matting + sd providers. */
function makeConfig(
  matting: Record<string, unknown> | undefined,
  sdProviders: Array<Record<string, unknown>> = [],
): Config {
  return {
    generation: { matting, providers: { sd: sdProviders, }, },
  } as unknown as Config;
}

const comfyProvider = {
  name: "comfy",
  apiFamily: "comfyui",
  baseUrl: "http://127.0.0.1:8188",
  models: { edit: ["qwen-image-edit",], },
};

/** One capability fixture drives every decision-table row. */
function honkboxFixture(mattingAvailable: boolean | undefined,): HonkboxProbeSuccess {
  const parsed = parseHonkboxCapabilities({
    api_version: "v1",
    image_ops: {
      ops: ["matting",],
      ...(mattingAvailable === undefined ? {} : { matting_available: mattingAvailable, }),
    },
  },);

  if (!parsed.ok) { throw new Error("capability fixture rejected",); }
  return { ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 0, };
}

describe("resolveMattingProvider", () => {
  test("returns null when the section is absent or backend none", () => {
    expect(resolveMattingProvider(makeConfig(undefined,), undefined,),).toBeNull();
    expect(
      resolveMattingProvider(makeConfig({ backend: "none", endpoint: "http://x", },), undefined,),
    ).toBeNull();
  });

  test("explicit rembg backend builds the rembg provider", () => {
    const provider = resolveMattingProvider(
      makeConfig({ backend: "rembg", endpoint: "http://127.0.0.1:7000", model: "isnet", },),
      undefined,
    );

    expect(provider?.name,).toBe("rembg:isnet",);
  });

  test("explicit http backend builds the generic provider", () => {
    const provider = resolveMattingProvider(
      makeConfig({ backend: "http", endpoint: "http://127.0.0.1:9000/mat", },),
      undefined,
    );

    expect(provider?.name,).toBe("http",);
  });

  test("auto prefers comfy when a comfyui sd provider exists", () => {
    const provider = resolveMattingProvider(
      makeConfig(
        { backend: "auto", },
        [comfyProvider, { name: "llama", apiFamily: "sdcpp", endpoint: "http://x", },],
      ),
      undefined,
    );

    expect(provider?.name,).toBe("comfy:birefnet.safetensors",);
  });

  test("auto falls back to rembg, then http, then null", () => {
    const rembg = resolveMattingProvider(
      makeConfig({ backend: "auto", endpoint: "http://r", model: "isnet", },),
      undefined,
    );

    expect(rembg?.name,).toBe("rembg:isnet",);

    const http = resolveMattingProvider(
      makeConfig({ backend: "auto", endpoint: "http://e", },),
      undefined,
    );

    expect(http?.name,).toBe("http",);

    expect(resolveMattingProvider(makeConfig({ backend: "auto", },), undefined,),).toBeNull();
  });

  test("comfy backend without a comfyui sd provider is null", () => {
    expect(
      resolveMattingProvider(makeConfig({ backend: "comfy", },), undefined,),
    ).toBeNull();
  });

  test("decision table: honkbox availability vs explicit backend", () => {
    expect(honkboxFixture(true,).capabilities.imageOps?.mattingAvailable,).toBe(true,);

    const rows: Array<{
      label: string;
      backend: string;
      probe: HonkboxProbeResult;
      expected: string;
      model?: string;
    }> = [
      {
        label: "available + local comfy → honkbox",
        backend: "auto",
        probe: honkboxFixture(true,),
        expected: "honkbox",
      },
      {
        label: "unavailable → local comfy",
        backend: "auto",
        probe: honkboxFixture(false,),
        expected: "comfy:birefnet.safetensors",
      },
      {
        label: "capability absent → local comfy",
        backend: "auto",
        probe: honkboxFixture(undefined,),
        expected: "comfy:birefnet.safetensors",
      },
      {
        label: "explicit comfy wins over honkbox",
        backend: "comfy",
        probe: honkboxFixture(true,),
        expected: "comfy:birefnet.safetensors",
      },
      {
        label: "explicit rembg wins over honkbox",
        backend: "rembg",
        probe: honkboxFixture(true,),
        expected: "rembg:isnet",
        model: "isnet",
      },
    ];

    for (const row of rows) {
      const config = makeConfig(
        {
          backend: row.backend,
          endpoint: "http://127.0.0.1:7000",
          // `model` is the rembg model; comfy keeps its own default.
          ...(row.model ? { model: row.model, } : {}),
        },
        [comfyProvider,],
      );

      expect(resolveMattingProvider(config, row.probe,)?.name, row.label,).toBe(row.expected,);
    }
  });

  test("honkbox request body sends inputs as data_uri objects", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1,],);
    let captured: Record<string, unknown> | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
      const url = typeof input === "string" ? input : input.toString();
      // Delegate every non-honkbox call so a concurrent test in the same
      // process keeps its own transport.
      if (!url.includes("/image-ops",)) { return await originalFetch(input, init,); }
      captured = JSON.parse(String(init?.body ?? "",),) as Record<string, unknown>;
      return Response.json({ outputs: [{ b64_json: png.toString("base64",), },], },);
    }) as unknown as typeof fetch;

    try {
      const provider = resolveMattingProvider(
        makeConfig({ backend: "auto", },),
        honkboxFixture(true,),
      );

      expect(provider?.name,).toBe("honkbox",);
      const out = await provider?.removeBackground(png,);
      expect(out?.length,).toBe(png.length,);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(captured?.command,).toBe("matting",);
    const inputs = captured?.inputs as Array<Record<string, unknown>> | undefined;
    expect(Array.isArray(inputs,),).toBe(true,);
    expect(inputs?.length,).toBe(1,);
    expect(Object.keys(inputs?.[0] ?? {},),).toEqual(["data_uri",],);
    expect(String(inputs?.[0]?.data_uri,).startsWith("data:image/png;base64,",),).toBe(true,);
  });
});
