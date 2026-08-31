/**
 * Tests for the Anthropic health / list-models dispatchers.
 */
import { describe, expect, test, } from "bun:test";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { AnthropicState, } from "./types";

const state: AnthropicState = {
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-ant-test",
  defaultModel: "claude-3-5-sonnet",
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
  test("maps /v1/models to ModelInfo", async () => {
    await withMockFetch(
      async () =>
        Response.json({
          data: [{ id: "claude-3-5-sonnet", display_name: "Claude 3.5 Sonnet", },],
        },),
      async () => {
        const models = await listModelsDispatch(state,);
        expect(models,).toEqual([{ id: "claude-3-5-sonnet", raw: expect.anything(), },],);
        expect(models[0]?.raw,).toBeTruthy();
      },
    );
  });

  test("returns an empty array when no models are present", async () => {
    await withMockFetch(
      async () => Response.json({ data: [], },),
      async () => {
        expect(await listModelsDispatch(state,),).toEqual([],);
      },
    );
  });
});

describe("healthCheckDispatch", () => {
  test("reports ok when models resolve", async () => {
    await withMockFetch(
      async () => Response.json({ data: [{ id: "claude-3-5-sonnet", },], },),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("ok",);
        expect(health.model,).toBe("claude-3-5-sonnet",);
        expect(typeof health.latencyMs,).toBe("number",);
      },
    );
  });

  test("reports down when the models call fails", async () => {
    await withMockFetch(
      async () => Response.json({ error: { message: "unauthorized", }, }, { status: 401, },),
      async () => {
        const health = await healthCheckDispatch(state,);
        expect(health.status,).toBe("down",);
        expect(health.error,).toBeTruthy();
      },
    );
  });
});
