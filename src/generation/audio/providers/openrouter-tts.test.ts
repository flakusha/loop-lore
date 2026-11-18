/**
 * Tests for the OpenRouter TTS audio provider.
 *
 * The transport is faked (global fetch), so no network call and no API key
 * is needed: the success path must pass the raw audio bytes through, and a
 * failed request must surface the JSON error envelope (402 = no credit).
 */
import { describe, expect, test, } from "bun:test";
import type { AudioGenRequest, } from "../types";
import { createOpenRouterTtsProvider, } from "./openrouter-tts";

/** Base URL pinned by the tests — the provider reads it from the env otherwise. */
const BASE_URL = "https://openrouter.ai/api/v1";

/** Requests share one shape; only the prompt varies. */
function request(prompt: string,): AudioGenRequest {
  return { prompt, seconds: 1, };
}

/** Capture the fetch stub while it runs, then restore the global. */
async function withStubbedFetch(
  stub: (url: string, init: RequestInit,) => Response | Promise<Response>,
  run: (calls: { url: string; init: RequestInit }[],) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit,) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit, },);
    return stub(url, requestInit,);
  }) as unknown as typeof fetch;

  try {
    await run(calls,);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("createOpenRouterTtsProvider", () => {
  test("is registered under a stable id and posts to /audio/speech", async () => {
    const provider = createOpenRouterTtsProvider({ apiKey: "sk-test", baseUrl: BASE_URL, },);
    expect(provider.id,).toBe("tts:openrouter",);

    await withStubbedFetch(
      () => new Response(new Uint8Array([1, 2, 3,],), { status: 200, headers: { "content-type": "audio/mpeg", }, },),
      async (calls,) => {
        await provider.generate(request("hello",),);

        expect(calls.length,).toBe(1,);
        expect(calls[0]!.url,).toBe(`${BASE_URL}/audio/speech`,);
        expect(calls[0]!.init.method,).toBe("POST",);

        const headers = calls[0]!.init.headers as Record<string, string>;
        expect(headers.Authorization,).toBe("Bearer sk-test",);

        const body = JSON.parse(String(calls[0]!.init.body,),) as Record<string, unknown>;
        expect(body.input,).toBe("hello",);
        expect(body.response_format,).toBe("mp3",);
        expect(typeof body.model,).toBe("string",);
      },
    );
  });

  test("returns the raw audio bytes and the audio mime type", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00,],);
    const provider = createOpenRouterTtsProvider({ apiKey: "sk-test", baseUrl: BASE_URL, },);

    await withStubbedFetch(
      () => new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", }, },),
      async () => {
        const outcome = await provider.generate(request("hello",),);

        expect(outcome.ok,).toBe(true,);
        if (!outcome.ok) { return; }
        expect(outcome.mimeType,).toBe("audio/mpeg",);
        expect(outcome.buffer.length,).toBe(bytes.length,);
        expect([...outcome.buffer,],).toEqual([...bytes,],);
      },
    );
  });

  test("maps the JSON error envelope to its status and message", async () => {
    const provider = createOpenRouterTtsProvider({ apiKey: "sk-test", baseUrl: BASE_URL, },);

    await withStubbedFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 400, message: "Invalid request parameters", }, },), {
          status: 400,
          headers: { "content-type": "application/json", },
        },),
      async () => {
        const outcome = await provider.generate(request("hello",),);

        expect(outcome.ok,).toBe(false,);
        if (outcome.ok) { return; }
        expect(outcome.status,).toBe(400,);
        expect(outcome.error,).toContain("Invalid request parameters",);
      },
    );
  });

  test("maps a 402 to the no-credit failure", async () => {
    const provider = createOpenRouterTtsProvider({ apiKey: "sk-test", baseUrl: BASE_URL, },);

    await withStubbedFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 402, message: "Insufficient credits.", }, },), {
          status: 402,
          headers: { "content-type": "application/json", },
        },),
      async () => {
        const outcome = await provider.generate(request("hello",),);

        expect(outcome.ok,).toBe(false,);
        if (outcome.ok) { return; }
        expect(outcome.status,).toBe(402,);
        expect(outcome.error,).toMatch(/credit/i,);
      },
    );
  });

  test("fails with a 500 when no API key is configured", async () => {
    const provider = createOpenRouterTtsProvider({ apiKey: "", baseUrl: BASE_URL, },);
    const outcome = await provider.generate(request("hello",),);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(500,);
    expect(outcome.error,).toMatch(/API key/,);
  });
});
