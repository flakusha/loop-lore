/**
 * Tests for the Ollama-native health / list-models / embed dispatchers.
 */
import { describe, expect, test, } from "bun:test";
import { embedDispatch, healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OllamaNativeState, } from "./types";

const state: OllamaNativeState = {
  baseUrl: "http://localhost:11434",
  apiKey: undefined,
  defaultModel: "llama3.2",
  timeout: 5000,
  retries: 1,
  headers: {},
};

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

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

describe("listModelsDispatch", () => {
  test("maps /api/tags models to ModelInfo", async () => {
    await withMockFetch(
      async () =>
        Response.json({
          models: [
            { name: "llama3.2", model: "llama3.2:latest", details: { parameter_size: "3.2B", }, },
          ],
        },),
      async () => {
        const models = await listModelsDispatch(state,);
        expect(models,).toEqual([
          { id: "llama3.2", paramSize: "3.2B", raw: expect.anything(), },
        ],);
        expect(models[0]?.raw,).toBeTruthy();
      },
    );
  });

  test("returns an empty array when no models are present", async () => {
    await withMockFetch(
      async () => Response.json({ models: [], },),
      async () => {
        expect(await listModelsDispatch(state,),).toEqual([],);
      },
    );
  });
});

describe("healthCheckDispatch", () => {
  test("reports ok when version + tags resolve", async () => {
    await withMockFetch(
      async (url,) => {
        if (url.endsWith("/api/version",)) {
          return Response.json({ version: "0.3.4", },);
        }
        return Response.json({ models: [{ name: "llama3.2", },], },);
      },
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("ok",);
        expect(health.model,).toBe("llama3.2",);
        expect(typeof health.latencyMs,).toBe("number",);
      },
    );
  });

  test("reports down when the version endpoint fails", async () => {
    await withMockFetch(
      async () => Response.json({ error: "connection refused", }, { status: 500, },),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("down",);
        expect(health.error,).toBeTruthy();
      },
    );
  });
});

describe("embedDispatch", () => {
  test("returns a 2D embedding for a single string input", async () => {
    await withMockFetch(
      async () => Response.json({ embeddings: [[0.1, 0.2, 0.3,],], prompt_eval_count: 2, },),
      async () => {
        const embeds = await embedDispatch(state, "hello", "llama3.2",);
        expect(embeds,).toEqual([[0.1, 0.2, 0.3,],],);
      },
    );
  });

  test("returns all embeddings for an array input", async () => {
    await withMockFetch(
      async () => Response.json({ embeddings: [[1,], [2,],], },),
      async () => {
        const embeds = await embedDispatch(state, ["a", "b",], "llama3.2",);
        expect(embeds,).toEqual([[1,], [2,],],);
      },
    );
  });
});
