/**
 * Tests for the LibreTranslate health / list-models dispatchers (the
 * instance /languages catalog).
 *
 * Resource contract: mocks globalThis.fetch (saved/restored per test); no
 * DB, no files, no ports, no registry entries.
 */
import { describe, expect, test, } from "bun:test";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { LibreTranslateState, } from "./types";

const state: LibreTranslateState = {
  baseUrl: "https://libre.example.com",
  apiKey: undefined,
  defaultModel: "en",
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

describe("listModelsDispatch (libretranslate)", () => {
  test("maps the instance language catalog to ModelInfo entries", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url,) => {
        captured.push({ url, },);
        return jsonResponse([
          { code: "en", name: "English", },
          { code: "ar", name: "Arabic", },
        ],);
      },
      async () => {
        const models = await listModelsDispatch(state,);
        expect(models,).toHaveLength(2,);
        expect(models[0]?.id,).toBe("en",);
        expect(models[1]?.id,).toBe("ar",);
      },
    );

    expect(captured[0]?.url,).toBe("https://libre.example.com/languages",);
  });
});

describe("healthCheckDispatch (libretranslate)", () => {
  test("ok when the language catalog resolves", async () => {
    await withMockFetch(
      () => jsonResponse([{ code: "en", name: "English", },],),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("ok",);
        expect(health.model,).toBe("en",);
      },
    );
  });

  test("down when the instance errors", async () => {
    await withMockFetch(
      () => jsonResponse({ error: "Instance is rate limited", }, 429,),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("down",);
        expect(health.error,).toContain("rate limited",);
      },
    );
  });
});
