/**
 * Tests for the pre-dispatch VRAM release hook.
 *
 * Every test drives an injected `fetchImpl`; the `seen` log is the assertion
 * surface for the never-call list (no bare `/unload`, no bulk
 * `POST /api/models/unload`, no `/pause`).
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { releaseModelsForRender, } from "./llama-swap-release";
import { COMFYUI_PROXY_MODEL_ID, } from "./llama-swap-unload";

createLogger({ level: "error", },);

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

    expect(summary,).toEqual({ released: ["llm-a",], },);
    expect(hitForbidden(seen,),).toBe(false,);
    const posts = seen.filter((call,) => call.method === "POST");
    expect(posts.map((call,) => new URL(call.url,).pathname.replace(/\/+$/, "",)),).toEqual([
      "/api/models/unload/llm-a",
    ],);
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

  test("already-unloaded model is a no-op", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], },);
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

  test("unreachable llama-swap is non-fatal", async () => {
    const summary = await releaseModelsForRender({
      llamaSwapBase: BASE,
      fetchImpl: throwingFetch(new Error("conn refused",),),
    },);

    expect(summary,).toEqual({ released: [], },);
  });

  test("refuses non-loopback base without a credential, without any fetch", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: "http://10.0.0.5:8080",
      fetchImpl: makeMock(seen, () => json({ running: [{ model: "llm-a", },], },),),
    },);

    expect(summary,).toEqual({ released: [], },);
    expect(seen,).toHaveLength(0,);
  });

  test("non-loopback base with a credential proceeds", async () => {
    const seen: SeenCall[] = [];
    const summary = await releaseModelsForRender({
      llamaSwapBase: "http://10.0.0.5:8080",
      apiKey: "sk-op",
      fetchImpl: makeMock(seen, () => json({ running: [], },),),
    },);

    expect(summary,).toEqual({ released: [], },);
    expect(seen,).toHaveLength(1,);
  });

  test("blank base throws (programmer error)", async () => {
    await expect(releaseModelsForRender({ llamaSwapBase: "", },),).rejects.toThrow(/llamaSwapBase/,);
  });
});
