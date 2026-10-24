/**
 * Tests for the DeepL generation dispatchers (complete + stream).
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
import { completeDispatch, normalizeDeepLTarget, streamDispatch, } from "./core";
import type { DeepLState, } from "./types";

const state: DeepLState = {
  baseUrl: "https://api-free.deepl.com",
  apiKey: "auth-key:fx",
  defaultModel: "en-us",
  timeout: 5000,
  retries: 0,
  headers: {},
};

/**
 * @param overrides
 */
function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "en-us",
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

/**
 * @param handler
 */
function capture(handler: (captured: CapturedRequest, url: string, init: RequestInit,) => Response,): (
  captured: CapturedRequest[],
) => FetchHandler {
  return (captured,) => (url, init,) => {
    captured.push({ url, init, },);
    return handler(captured[captured.length - 1]!, url, init,);
  };
}

describe("normalizeDeepLTarget", () => {
  test("uppercases plain and region-qualified codes", () => {
    expect(normalizeDeepLTarget("de",),).toBe("DE",);
    expect(normalizeDeepLTarget("en-us",),).toBe("EN-US",);
    expect(normalizeDeepLTarget("pt-br",),).toBe("PT-BR",);
  });
});

describe("completeDispatch (deepl)", () => {
  test("posts user text to /v2/translate with the DeepL-Auth-Key header", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      capture(() => jsonResponse({ translations: [{ detected_source_language: "ES", text: "hello", },], },))(
        captured,
      ),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("hello",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, },);
      },
    );

    expect(captured,).toHaveLength(1,);
    const { url, init, } = captured[0]!;
    expect(url,).toBe("https://api-free.deepl.com/v2/translate",);
    expect(init.method,).toBe("POST",);
    expect((init.headers as Record<string, string>)["DeepL-Auth-Key"],).toBe("auth-key:fx",);
    expect(JSON.parse(init.body as string,),).toEqual({ text: ["hola",], target_lang: "EN-US", },);
  });

  test("system prompts are ignored — only user content is the text", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      capture(() => jsonResponse({ translations: [{ text: "hello", },], },))(captured,),
      async () => {
        await completeDispatch(state, req(),);
        expect(JSON.parse(captured[0]!.init.body as string,).text,).toEqual(["hola",],);
      },
    );
  });

  test("request model overrides the state default target", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      capture(() => jsonResponse({ translations: [{ text: "olá", },], },))(captured,),
      async () => {
        await completeDispatch(state, req({ model: "pt-br", },),);
        expect(JSON.parse(captured[0]!.init.body as string,).target_lang,).toBe("PT-BR",);
      },
    );
  });

  test("falls back to the state default model when the request has none", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      capture(() => jsonResponse({ translations: [{ text: "hello", },], },))(captured,),
      async () => {
        await completeDispatch(state, req({ model: "", },),);
        expect(JSON.parse(captured[0]!.init.body as string,).target_lang,).toBe("EN-US",);
      },
    );
  });

  test("rejects when neither the request nor the state carries a target language", async () => {
    const noTarget: DeepLState = { ...state, defaultModel: "", };
    await expect(completeDispatch(noTarget, req({ model: "", },),),).rejects.toThrow(
      "DeepL translate requires a target language (request model)",
    );

    await expect(completeDispatch(noTarget, req({ model: "", },),),).rejects.toBeInstanceOf(ProviderError,);
  });

  test("rejects when the request carries no user text", async () => {
    await expect(
      completeDispatch(state, req({ messages: [{ role: "system", content: "translate", },], },),),
    ).rejects.toThrow("DeepL translate requires user message text",);

    await expect(
      completeDispatch(state, req({ messages: [{ role: "system", content: "translate", },], },),),
    ).rejects.toBeInstanceOf(ProviderError,);
  });

  test("API error rejects with ProviderError (no throw across the seam)", async () => {
    await withMockFetch(
      () => jsonResponse({ message: "Wrong key", }, 403,),
      async () => {
        expect(completeDispatch(state, req(),),).rejects.toBeInstanceOf(ProviderError,);
        await expect(completeDispatch(state, req(),),).rejects.toThrow("Wrong key",);
      },
    );
  });
});

describe("streamDispatch (deepl)", () => {
  test("streaming is unsupported (501)", async () => {
    await expect(streamDispatch(state, req(),),).rejects.toThrow("does not support streaming",);
  });
});
