/**
 * Tests for the precise per-model llama-swap unload + pre-dispatch hook.
 *
 * Every test drives an injected `fetchImpl`; the `seen` log is the assertion
 * surface for the never-call list (no bare `/unload`, no bulk
 * `POST /api/models/unload`, no `/pause`) and the exact-one-model POST shape.
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import {
  baseHost,
  COMFYUI_PROXY_MODEL_ID,
  computeEvictionSet,
  isLoopbackHost,
  unloadLlamaSwapModel,
} from "./llama-swap-unload";

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

describe("unloadLlamaSwapModel", () => {
  test("POSTs the exact one-model endpoint", async () => {
    const seen: SeenCall[] = [];
    const out = await unloadLlamaSwapModel({
      llamaSwapBase: `${BASE}///`,
      modelId: "llm-a",
      fetchImpl: makeMock(seen, () => json({ msg: "ok", },),),
    },);

    expect(out,).toEqual({ ok: true, alreadyGone: false, },);
    expect(seen,).toHaveLength(1,);
    expect(seen[0],).toEqual({ url: `${BASE}/api/models/unload/llm-a`, method: "POST", },);
  });

  test("encodes the model id into the path", async () => {
    const seen: SeenCall[] = [];
    await unloadLlamaSwapModel({
      llamaSwapBase: BASE,
      modelId: "model a/b",
      fetchImpl: makeMock(seen, () => json({ msg: "ok", },),),
    },);

    expect(seen[0]?.url,).toBe(`${BASE}/api/models/unload/model%20a%2Fb`,);
  });

  test('404 "model not found" is a continue-case', async () => {
    const out = await unloadLlamaSwapModel({
      llamaSwapBase: BASE,
      modelId: "gone",
      fetchImpl: makeMock([], () => json("model not found", 404,),),
    },);

    expect(out,).toEqual({ ok: true, alreadyGone: true, },);
  });

  test('404 "no local server found" is a continue-case', async () => {
    const out = await unloadLlamaSwapModel({
      llamaSwapBase: BASE,
      modelId: "peer-model",
      fetchImpl: makeMock([], () => json("no local server found for requested model", 404,),),
    },);

    expect(out,).toEqual({ ok: true, alreadyGone: true, },);
  });

  test("non-2xx is a warned non-fatal outcome, never a throw", async () => {
    const out = await unloadLlamaSwapModel({
      llamaSwapBase: BASE,
      modelId: "llm-a",
      fetchImpl: makeMock([], () => json("boom", 500,),),
    },);

    expect(out.ok,).toBe(false,);
  });

  test("unreachable is a non-fatal outcome, never a throw", async () => {
    const out = await unloadLlamaSwapModel({
      llamaSwapBase: BASE,
      modelId: "llm-a",
      fetchImpl: throwingFetch(new Error("conn refused",),),
    },);

    expect(out.ok,).toBe(false,);
  });

  test("blank base or id throws (programmer error)", async () => {
    await expect(unloadLlamaSwapModel({ llamaSwapBase: "", modelId: "x", },),).rejects.toThrow(/llamaSwapBase/,);
    await expect(unloadLlamaSwapModel({ llamaSwapBase: BASE, modelId: "", },),).rejects.toThrow(/modelId/,);
  });
});

describe("isLoopbackHost", () => {
  test("matches IPv4, localhost, and bracketed IPv6 loopback", () => {
    expect(isLoopbackHost(baseHost("http://127.0.0.1:8080",),),).toBe(true,);
    expect(isLoopbackHost(baseHost("http://localhost:8080",),),).toBe(true,);
    // `new URL("http://[::1]:…").hostname` keeps the brackets.
    expect(isLoopbackHost(baseHost("http://[::1]:8080",),),).toBe(true,);
    expect(isLoopbackHost(baseHost("http://10.0.0.5:8080",),),).toBe(false,);
  });
});

describe("computeEvictionSet", () => {
  test("excludes comfyui_auto by construction", async () => {
    const ids = await computeEvictionSet({
      llamaSwapBase: BASE,
      fetchImpl: makeMock([], () => json({ running: [{ model: "llm-a", }, { model: COMFYUI_PROXY_MODEL_ID, },], },),),
    },);

    expect(ids,).toEqual(["llm-a",],);
  });

  test("includes proxy-served models (no proxy/cmd filtering)", async () => {
    const ids = await computeEvictionSet({
      llamaSwapBase: BASE,
      fetchImpl: makeMock([], () => json({ running: [{ model: "remote-llm", proxy: "http://peer:8080", },], },),),
    },);

    expect(ids,).toEqual(["remote-llm",],);
  });

  test("fresh GET per call, never cached across awaits", async () => {
    let calls = 0;
    const fetchImpl = makeMock([], () => {
      calls += 1;
      return json({ running: calls === 1 ? [{ model: "llm-a", },] : [{ model: "llm-b", },], },);
    },);

    const first = await computeEvictionSet({ llamaSwapBase: BASE, fetchImpl, },);
    const second = await computeEvictionSet({ llamaSwapBase: BASE, fetchImpl, },);
    expect(first,).toEqual(["llm-a",],);
    expect(second,).toEqual(["llm-b",],);
  });

  test("unreachable /running yields an empty set, never a throw", async () => {
    const ids = await computeEvictionSet({
      llamaSwapBase: BASE,
      fetchImpl: throwingFetch(new Error("down",),),
    },);

    expect(ids,).toEqual([],);
  });

  test("malformed /running yields an empty set, never a throw", async () => {
    const ids = await computeEvictionSet({
      llamaSwapBase: BASE,
      fetchImpl: makeMock([], () => json({ running: "nope", },),),
    },);

    expect(ids,).toEqual([],);
  });
});
