/**
 * Tests for the Google Translate generation dispatchers (complete + stream).
 *
 * Mirrors the anthropic provider's test style: mock `fetch`, drive the
 * dispatchers directly, assert request shape + mapped output. API errors
 * reject with ProviderError — the seam contract (never a bare throw).
 *
 * Resource contract: mocks globalThis.fetch (saved/restored per test); no
 * DB, no files, no ports, no registry entries.
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, } from "../types";
import { ProviderError, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import type { GoogleTranslateState, } from "./types";

const state: GoogleTranslateState = {
  baseUrl: "https://translation.googleapis.com",
  apiKey: "g-key",
  defaultModel: "en",
  timeout: 5000,
  retries: 0,
  headers: {},
};

/**
 * @param overrides
 */
function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "en",
    messages: [
      { role: "system", content: "Translate the following text into English. Output ONLY the translated text.", },
      { role: "user", content: "hola", },
    ],
    params: {},
    ...overrides,
  };
}

type FetchHandler = (url: URL, init: RequestInit,) => Response | Promise<Response>;

/** */
interface CapturedRequest {
  url: URL;
  init: RequestInit;
}

/**
 * @param handler
 * @param fn
 */
async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const originalFetch = globalThis.fetch;

  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

/**
 * @param body
 * @param status
 */
function jsonResponse(body: unknown, status = 200,): Response {
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

describe("completeDispatch (google-translate)", () => {
  test("posts q/target/format to the v2 endpoint with the key query param", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url, init,) => {
        captured.push({ url, init, },);
        return jsonResponse({
          data: { translations: [{ translatedText: "hello", detectedSourceLanguage: "es", },], },
        },);
      },
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("hello",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, },);
      },
    );

    expect(captured,).toHaveLength(1,);
    const { url, init, } = captured[0]!;
    expect(`${url.origin}${url.pathname}`,).toBe("https://translation.googleapis.com/language/translate/v2",);
    expect(url.searchParams.get("key",),).toBe("g-key",);
    expect(init.method,).toBe("POST",);
    expect(JSON.parse(init.body as string,),).toEqual({ q: "hola", target: "en", format: "text", },);
  });

  test("request model overrides the state default target (region code kept)", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url, init,) => {
        captured.push({ url, init, },);
        return jsonResponse({ data: { translations: [{ translatedText: "你好", },], }, },);
      },
      async () => {
        await completeDispatch(state, req({ model: "zh-CN", },),);
        expect(JSON.parse(captured[0]!.init.body as string,).target,).toBe("zh-CN",);
      },
    );
  });

  test("rejects when neither the request nor the state carries a target language", async () => {
    const noTarget: GoogleTranslateState = { ...state, defaultModel: "", };
    await expect(completeDispatch(noTarget, req({ model: "", },),),).rejects.toBeInstanceOf(ProviderError,);
    await expect(completeDispatch(noTarget, req({ model: "", },),),).rejects.toThrow(
      "Google Translate requires a target language (request model)",
    );
  });

  test("rejects when the request carries no user text", async () => {
    const noText = req({ messages: [{ role: "system", content: "Translate this.", },], },);
    await expect(completeDispatch(state, noText,),).rejects.toBeInstanceOf(ProviderError,);
    await expect(completeDispatch(state, noText,),).rejects.toThrow("requires user message text",);
  });

  test("API error rejects with ProviderError (no throw across the seam)", async () => {
    await withMockFetch(
      () => jsonResponse({ error: { code: 400, message: "Invalid API key", status: "INVALID_ARGUMENT", }, }, 400,),
      async () => {
        await expect(completeDispatch(state, req(),),).rejects.toBeInstanceOf(ProviderError,);
        await expect(completeDispatch(state, req(),),).rejects.toThrow("Invalid API key",);
      },
    );
  });
});

describe("streamDispatch (google-translate)", () => {
  test("streaming is unsupported (501)", async () => {
    await expect(streamDispatch(state, req(),),).rejects.toThrow("does not support streaming",);
  });
});
