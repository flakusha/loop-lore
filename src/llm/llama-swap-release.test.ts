/**
 * Tests for the pre-dispatch VRAM release hook.
 *
 * Every test drives an injected `fetchImpl`; the `seen` log is the assertion
 * surface for the never-call list (no bare `/unload`, no bulk
 * `POST /api/models/unload`, no `/pause`).
 */
import { describe, expect, test, } from "bun:test";
import type { HonkboxProbeResult, } from "../integrations/honkbox/capabilities";
import { createLogger, } from "../logger";
import { releaseModelsForRender, } from "./llama-swap-release";
import { COMFYUI_PROXY_MODEL_ID, } from "./llama-swap-unload";

createLogger({ level: "error", },);

/** Minimal probe carrying only the residency flag under test. */
function honkboxProbeWithResidency(residencyControl: boolean,): HonkboxProbeResult {
  return {
    ok: true,
    supported: true,
    latencyMs: 1,
    capabilities: { features: { residencyControl, }, },
  } as unknown as HonkboxProbeResult;
}

const BASE = "http://127.0.0.1:8080";

interface SeenCall {
  url: string;
  method: string;
}

/**
 * @param seen - call log to append to
 * @param responder - per-URL stub
 * @returns fetch-shaped stub recording every call
 */
function makeMock(
  seen: SeenCall[],
  responder: (url: string, init: RequestInit,) => Response | Promise<Response>,
): typeof fetch {
  return (async (url: unknown, init?: RequestInit,) => {
    const raw = String(url,);
    seen.push({ url: raw, method: init?.method ?? "GET", },);
    return responder(raw, init ?? {},);
  }) as typeof fetch;
}

/**
 * @param body - JSON body
 * @param status - HTTP status
 * @returns JSON response
 */
function json(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

/**
 * @param error - value thrown by fetch
 * @returns a fetch-shaped stub that always throws
 */
function throwingFetch(error: Error,): typeof fetch {
  return (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

/**
 * @param seen - recorded fetch calls
 * @returns true when a global-unload or pause endpoint was ever hit
 */
function hitForbidden(seen: SeenCall[],): boolean {
  return seen.some((call,) => {
    // Template-built per-model POSTs (`${base}/api/models/unload/${id}`)
    // must not trip exact-equality checks when `base` carries a trailing
    // slash, so normalize before comparing against the bulk endpoint.
    const path = new URL(call.url,).pathname.replace(/\/+$/, "",);
    if (path.includes("pause",)) {
      return true;
    }

    if (path === "/unload") {
      return true;
    }

    return path === "/api/models/unload";
  },);
}

describe("releaseModelsForRender", () => {
  test("unloads each id, spares comfyui_auto, never touches global/pause", async () => {
    const seen: SeenCall[] = [];
    let running = [{ model: "llm-a", }, { model: COMFYUI_PROXY_MODEL_ID, },];
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: makeMock(seen, (url, init,) => {
        if (new URL(url,).pathname === "/running") {
          return json({ running, },);
        }

        expect(init.method,).toBe("POST",);
        running = running.filter((entry,) => entry.model !== "llm-a");
        return json({ msg: "ok", },);
      },),
    },);

    expect(summary,).toEqual({ released: ["llm-a",], probeOk: true, },);
    expect(hitForbidden(seen,),).toBe(false,);
    const posts = seen.filter((call,) => call.method === "POST");
    expect(posts.map((call,) => new URL(call.url,).pathname.replace(/\/+$/, "",)),).toEqual([
      "/api/models/unload/llm-a",
    ],);
  });

  test("listenPort resolves the spawned proxy base (no explicit base)", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      listenPort: 9099,
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: true, },);
    expect(seen,).toHaveLength(1,);
    expect(seen[0]?.url,).toBe("http://127.0.0.1:9099/running",);
  });

  test("explicit base wins over env and listenPort", async () => {
    const saved = process.env.LLAMA_SWAP_BASE_URL;
    const seen: SeenCall[] = [];
    try {
      process.env.LLAMA_SWAP_BASE_URL = "http://env:1";
      const summary = await releaseModelsForRender({
        llamaSwapBase: BASE,
        listenPort: 9099,
        fetchImpl: makeMock(seen, () => json({ running: [], },),),
      },);

      expect(summary.probeOk,).toBe(true,);
      expect(seen[0]?.url,).toBe(`${BASE}/running`,);
    } finally {
      if (saved === undefined) { delete process.env.LLAMA_SWAP_BASE_URL; }
      else { process.env.LLAMA_SWAP_BASE_URL = saved; }
    }
  });

  test("drain poll precedes the return; render submitted after resolves post-unload", async () => {
    const seen: SeenCall[] = [];
    let polls = 0;
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      drainPollMs: 1,
      fetchImpl: makeMock(seen, (url,) => {
        if (new URL(url,).pathname === "/running") {
          polls += 1;
          return json({ running: polls < 3 ? [{ model: "llm-a", },] : [], },);
        }

        return json({ msg: "ok", },);
      },),
    },);

    expect(summary.released,).toEqual(["llm-a",],);
    const postIdx = seen.findIndex((call,) => call.method === "POST");
    const drainIdx = seen.map((call,) => call.url).lastIndexOf(`${BASE}/running`,);
    expect(postIdx,).toBeGreaterThan(-1,);
    // The final drain poll (empty set) happens after the unload POST.
    expect(drainIdx,).toBeGreaterThan(postIdx,);
    expect(polls,).toBeGreaterThanOrEqual(3,);
  });

  test("already-unloaded model is a clean no-op (probe ok)", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: true, },);
    expect(seen.filter((call,) => call.method === "POST"),).toHaveLength(0,);
  });

  test("both 404 shapes continue the sequence", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: makeMock(seen, (url,) => {
        if (new URL(url,).pathname === "/running") {
          return json({
            running: seen.some((call,) => call.method === "POST") ? [] : [{ model: "gone", }, { model: "peer", },],
          },);
        }

        return json(url.endsWith("/gone",) ? "model not found" : "no local server found for requested model", 404,);
      },),
    },);

    expect(summary.released.sort(),).toEqual(["gone", "peer",],);
    expect(hitForbidden(seen,),).toBe(false,);
  });

  test("unreachable probe is loud (probeOk:false), still non-fatal, with a throwing opt-in", async () => {
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: throwingFetch(new Error("conn refused",),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: false, },);
    await expect(releaseModelsForRender({
      llamaSwapBase: BASE,
      throwOnProbeFailure: true,
      fetchImpl: throwingFetch(new Error("conn refused",),),
    },),).rejects.toThrow(/VRAM NOT released/,);
  });

  test("refuses non-loopback base without a credential, without any fetch", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: "http://10.0.0.5:8080",
      fetchImpl: makeMock(seen, () => json({ running: [{ model: "llm-a", },], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: false, },);
    expect(seen,).toHaveLength(0,);
  });

  test("non-loopback base with a credential proceeds", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: "http://10.0.0.5:8080",
      apiKey: "sk-op",
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: true, },);
    expect(seen,).toHaveLength(1,);
  });

  test("blank base throws (programmer error)", async () => {
    await expect(releaseModelsForRender({ llamaSwapBase: "", },),).rejects.toThrow(/llamaSwapBase/,);
  });

  test("residency flag routes release through honkbox origin endpoints", async () => {
    const seen: SeenCall[] = [];
    let running = [{ model: "llm-a", },];
    const summary = await releaseModelsForRender({
      llamaSwapBase: "http://127.0.0.1:1",
      honkbox: {
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: honkboxProbeWithResidency(true,),
      },
      fetchImpl: makeMock(seen, (url,) => {
        const path = new URL(url,).pathname;
        if (path === "/running") { return json({ running, },); }
        expect(path,).toBe("/api/models/unload/llm-a",);
        running = [];
        return json({ msg: "ok", },);
      },),
    },);

    expect(summary,).toEqual({ released: ["llm-a",], probeOk: true, },);
    expect(seen[0]?.url,).toBe("http://127.0.0.1:9010/running",);
    expect(seen.some((call,) => call.url.includes(":1/",)),).toBe(false,);
  });

  test("residency flag false keeps the llama-swap path", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      honkbox: {
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: honkboxProbeWithResidency(false,),
      },
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: true, },);
    expect(seen[0]?.url,).toBe(`${BASE}/running`,);
  });

  test("unreachable honkbox backend is warned and non-fatal", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      honkbox: {
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: honkboxProbeWithResidency(true,),
      },
      fetchImpl: makeMock(seen, () => {
        throw new Error("connection refused",);
      },),
    },);

    expect(summary,).toEqual({ released: [], probeOk: false, },);
  });

  test("non-loopback honkbox base without a credential is refused", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      honkbox: {
        baseUrl: "http://10.0.0.5:9010/v1",
        probe: honkboxProbeWithResidency(true,),
      },
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: false, },);
    expect(seen,).toHaveLength(0,);
  });

  test("honkbox unload failure warns but preserves probeOk", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      honkbox: {
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: honkboxProbeWithResidency(true,),
      },
      fetchImpl: makeMock(seen, (url,) =>
        new URL(url,).pathname === "/running"
          ? json({ running: [{ model: "llm-a", },], },)
          : json({ error: "nope", }, 500,),),
    },);

    expect(summary,).toEqual({ released: [], probeOk: true, },);
  });
});
