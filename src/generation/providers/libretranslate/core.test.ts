/**
 * Tests for the LibreTranslate generation dispatchers (complete + stream).
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
import type { LibreTranslateState, } from "./types";

const state: LibreTranslateState = {
  baseUrl: "https://libre.example.com",
  apiKey: undefined,
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

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

/** */
interface CapturedRequest {
  url: string;
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

describe("completeDispatch (libretranslate)", () => {
  test("posts q/target/format to {baseUrl}/translate (no key when unset)", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url, init,) => {
        captured.push({ url, init, },);
        return jsonResponse({ translatedText: "hello", detectedLanguage: { language: "ES", }, },);
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
    expect(url,).toBe("https://libre.example.com/translate",);
    expect(init.method,).toBe("POST",);
    const body = JSON.parse(init.body as string,);
    expect(body,).toEqual({ q: "hola", source: "auto", target: "en", format: "text", },);
  });

  test("api_key is included when the instance is configured with one", async () => {
    const keyed: LibreTranslateState = { ...state, apiKey: "instance-key", };
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url, init,) => {
        captured.push({ url, init, },);
        return jsonResponse({ translatedText: "hello", },);
      },
      async () => {
        await completeDispatch(keyed, req(),);
        const body = JSON.parse(captured[0]!.init.body as string,);
        expect(body.api_key,).toBe("instance-key",);
      },
    );
  });

  test("request model overrides the state default target", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url, init,) => {
        captured.push({ url, init, },);
        return jsonResponse({ translatedText: "olá", },);
      },
      async () => {
        await completeDispatch(state, req({ model: "pt", },),);
        expect(JSON.parse(captured[0]!.init.body as string,).target,).toBe("pt",);
      },
    );
  });

  test("API error rejects with ProviderError (no throw across the seam)", async () => {
    await withMockFetch(
      () => jsonResponse({ error: "Please contact the operator", }, 403,),
      async () => {
        await expect(completeDispatch(state, req(),),).rejects.toBeInstanceOf(ProviderError,);
        await expect(completeDispatch(state, req(),),).rejects.toThrow("Please contact the operator",);
      },
    );
  });
});

describe("streamDispatch (libretranslate)", () => {
  test("streaming is unsupported (501)", async () => {
    await expect(streamDispatch(state, req(),),).rejects.toThrow("does not support streaming",);
  });
});
