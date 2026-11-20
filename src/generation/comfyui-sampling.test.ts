// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sampler/scheduler discovery tests. Each test owns a kernel-assigned port
 * (no fixed ports) and a unique base URL, so the shared cache is never
 * cleared out from under a sibling test and no global fetch stub leaks.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { discoverComfyUISampling, } from "./comfyui-sampling";

const servers: ReturnType<typeof Bun.serve>[] = [];

afterEach(() => {
  for (const server of servers.splice(0,)) { server.stop(true,); }
},);

/** Serve an /object_info payload; return its unique base URL and hit count. */
function serveObjectInfo(payload: unknown,): { baseUrl: string; hits: () => number } {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch: (request,) => {
      if (new URL(request.url,).pathname === "/object_info") {
        hits += 1;
        return Response.json(payload,);
      }

      return new Response("not found", { status: 404, },);
    },
  },);

  servers.push(server,);
  return { baseUrl: `http://127.0.0.1:${server.port}`, hits: () => hits, };
}

const ksampler = (samplers: string[], schedulers: string[],) => ({
  KSampler: {
    input: {
      required: {
        sampler_name: [samplers, {},],
        scheduler: [schedulers, {},],
      },
    },
  },
});

describe("discoverComfyUISampling", () => {
  it("reads sampler and scheduler as two distinct lists", async () => {
    const { baseUrl, hits, } = serveObjectInfo(
      ksampler(["euler", "dpmpp_2m", "ddim",], ["simple", "karras", "normal",],),
    );

    const result = await discoverComfyUISampling(baseUrl,);
    expect(result.reachable,).toBe(true,);
    expect(result.samplers,).toEqual(["euler", "dpmpp_2m", "ddim",],);
    expect(result.schedulers,).toEqual(["simple", "karras", "normal",],);

    // A second call comes from the shared five-minute cache.
    await discoverComfyUISampling(baseUrl,);
    expect(hits(),).toBe(1,);
  });

  it("falls back to KSamplerAdvanced when KSampler is absent", async () => {
    const { baseUrl, } = serveObjectInfo({
      KSamplerAdvanced: {
        input: {
          required: {
            sampler_name: [["er_sde", "euler",], {},],
            scheduler: [["simple",], {},],
          },
        },
      },
    },);

    const result = await discoverComfyUISampling(baseUrl,);
    expect(result.samplers,).toEqual(["er_sde", "euler",],);
    expect(result.schedulers,).toEqual(["simple",],);
  });

  it("tolerates a graph with no KSampler node", async () => {
    const { baseUrl, } = serveObjectInfo({ UpscaleModelLoader: {}, },);

    const result = await discoverComfyUISampling(baseUrl,);
    expect(result.reachable,).toBe(true,);
    expect(result.samplers,).toEqual([],);
    expect(result.schedulers,).toEqual([],);
    expect(result.advisory,).toContain("KSampler",);
  });

  it("reports an advisory when ComfyUI is unreachable", async () => {
    const { baseUrl, } = serveObjectInfo({},);
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    const server = servers.pop()!;
    server.stop(true,);
    const port = new URL(baseUrl,).port;

    const result = await discoverComfyUISampling(`http://127.0.0.1:${port}`, {
      timeoutMs: 200,
    },);

    expect(result.reachable,).toBe(false,);
    expect(result.samplers,).toEqual([],);
    expect(result.schedulers,).toEqual([],);
    expect(result.advisory,).toContain("ComfyUI",);
  });
});
