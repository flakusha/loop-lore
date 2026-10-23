/**
 * Tests for the Google Translate health / list-models dispatchers (the v2
 * languages catalog, anchored to English names).
 *
 * Resource contract: mocks globalThis.fetch (saved/restored per test); no
 * DB, no files, no ports, no registry entries.
 */
import { describe, expect, test, } from "bun:test";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { GoogleTranslateState, } from "./types";

const state: GoogleTranslateState = {
  baseUrl: "https://translation.googleapis.com",
  apiKey: "g-key",
  defaultModel: "en",
  timeout: 5000,
  retries: 0,
  headers: {},
};

type FetchHandler = (url: URL, init: RequestInit,) => Response | Promise<Response>;

/** */
interface CapturedRequest {
  path: string;
  key: string | null;
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

describe("listModelsDispatch (google-translate)", () => {
  test("maps the v2 language catalog to ModelInfo entries", async () => {
    const captured: CapturedRequest[] = [];
    await withMockFetch(
      (url,) => {
        captured.push({ path: `${url.origin}${url.pathname}`, key: url.searchParams.get("key",), },);
        return jsonResponse({
          data: {
            languages: [{ language: "en", name: "English", }, { language: "zh-CN", name: "Chinese (Simplified)", },],
          },
        },);
      },
      async () => {
        const models = await listModelsDispatch(state,);
        expect(models,).toHaveLength(2,);
        expect(models[0]?.id,).toBe("en",);
        expect(models[1]?.id,).toBe("zh-CN",);
      },
    );

    expect(captured[0]?.path,).toBe("https://translation.googleapis.com/language/translate/v2/languages",);
    expect(captured[0]?.key,).toBe("g-key",);
  });
});

describe("healthCheckDispatch (google-translate)", () => {
  test("ok when the language catalog resolves", async () => {
    await withMockFetch(
      () => jsonResponse({ data: { languages: [{ language: "en", name: "English", },], }, },),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("ok",);
        expect(health.model,).toBe("en",);
      },
    );
  });

  test("down when the API errors", async () => {
    await withMockFetch(
      () => jsonResponse({ error: { code: 403, message: "API key expired", status: "PERMISSION_DENIED", }, }, 403,),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("down",);
        expect(health.error,).toContain("API key expired",);
      },
    );
  });
});
