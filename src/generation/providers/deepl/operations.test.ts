/**
 * Tests for the DeepL health / list-models dispatchers (the /v2/languages
 * target-language catalog).
 *
 * Resource contract: mocks globalThis.fetch (saved/restored per test); no
 * DB, no files, no ports, no registry entries.
 */
import { describe, expect, test, } from "bun:test";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { DeepLState, } from "./types";

const state: DeepLState = {
  baseUrl: "https://api.deepl.com",
  apiKey: "pro-key",
  defaultModel: "en-us",
  timeout: 5000,
  retries: 0,
  headers: {},
};

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

/** */
interface CapturedRequest {
  url: string;
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

describe("listModelsDispatch (deepl)", () => {
  test("maps the target-language catalog to ModelInfo entries", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url,) => {
        captured.push({ url, },);
        return jsonResponse([
          { language: "DE", name: "German", supports_formality: true, },
          { language: "EN-US", name: "English (American)", },
        ],);
      },
      async () => {
        const models = await listModelsDispatch(state,);
        expect(models,).toHaveLength(2,);
        expect(models[0]?.id,).toBe("DE",);
        expect(models[1]?.id,).toBe("EN-US",);
        expect(models[0]?.raw,).toEqual({ language: "DE", name: "German", supports_formality: true, },);
      },
    );

    expect(captured[0]?.url,).toBe("https://api.deepl.com/v2/languages?type=target",);
  });
});

describe("healthCheckDispatch (deepl)", () => {
  test("ok when the language catalog resolves", async () => {
    await withMockFetch(
      () => jsonResponse([{ language: "DE", name: "German", },],),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("ok",);
        expect(health.model,).toBe("DE",);
        expect(health.latencyMs,).toBeGreaterThanOrEqual(0,);
      },
    );
  });

  test("down when the API errors", async () => {
    await withMockFetch(
      () => jsonResponse({ message: "Wrong key", }, 403,),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("down",);
        expect(health.error,).toContain("Wrong key",);
      },
    );
  });
});
