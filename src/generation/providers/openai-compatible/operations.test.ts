// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/providers/openai-compatible/operations.ts — the
 * list-models and health-check dispatchers. Global fetch is stubbed with
 * canned OpenAI-shaped responses (no network).
 */
import { afterAll, afterEach, describe, expect, it, } from "bun:test";
import { ProviderAuthError, } from "../types";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OpenAiCompatibleState, } from "./types";

const originalFetch = globalThis.fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
},);

function makeState(overrides: Partial<OpenAiCompatibleState>,): OpenAiCompatibleState {
  return {
    baseUrl: "http://127.0.0.1:9",
    apiKey: "sk-test",
    defaultModel: "default-model",
    timeout: 5_000,
    retries: 0,
    headers: {},
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200,): Response {
  return new Response(JSON.stringify(payload,), {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

describe("listModelsDispatch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  it("maps /models entries to ModelInfo", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        data: [
          {
            id: "qwen2.5-7b-instruct",
            owned_by: "local",
            context_length: 32_768,
            max_output: 4_096,
            thinking: false,
            tool_calling: true,
            modalities: ["text", "vision",],
          },
          { id: "embed-v1", },
        ],
      },)) as unknown as typeof fetch;

    const models = await listModelsDispatch(makeState({},),);
    expect(models,).toHaveLength(2,);
    expect(models[0]?.id,).toBe("qwen2.5-7b-instruct",);
    expect(models[0]?.ownedBy,).toBe("local",);
    expect(models[0]?.contextWindow,).toBe(32_768,);
    expect(models[0]?.maxOutput,).toBe(4_096,);
    expect(models[0]?.thinking,).toBe(false,);
    expect(models[0]?.toolCalling,).toBe(true,);
    expect(models[0]?.modalities,).toEqual(["text", "vision",],);
    expect(models[1]?.id,).toBe("embed-v1",);
  });

  it("returns an empty list when the payload has no data field", async () => {
    globalThis.fetch = (async () => jsonResponse({},)) as unknown as typeof fetch;
    expect(await listModelsDispatch(makeState({},),),).toEqual([],);
  });

  it("throws ProviderAuthError on a 401 response", async () => {
    globalThis.fetch = (async () => jsonResponse({ error: { message: "bad key", }, }, 401,)) as unknown as typeof fetch;

    await expect(listModelsDispatch(makeState({},),),).rejects.toBeInstanceOf(ProviderAuthError,);
  });

  it("throws the mapped provider error on a 500 response", async () => {
    globalThis.fetch = (async () => jsonResponse({ error: { message: "kaboom", }, }, 500,)) as unknown as typeof fetch;

    await expect(listModelsDispatch(makeState({},),),).rejects.toThrow("kaboom",);
  });
});

describe("healthCheckDispatch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  it("reports ok with the first model when models exist", async () => {
    globalThis.fetch =
      (async () => jsonResponse({ data: [{ id: "model-a", }, { id: "model-b", },], },)) as unknown as typeof fetch;

    const health = await healthCheckDispatch(makeState({},),);
    expect(health.status,).toBe("ok",);
    expect(health.model,).toBe("model-a",);
    expect(typeof health.latencyMs,).toBe("number",);
  });

  it("reports degraded when no models are returned", async () => {
    globalThis.fetch = (async () => jsonResponse({ data: [], },)) as unknown as typeof fetch;

    const health = await healthCheckDispatch(makeState({},),);
    expect(health.status,).toBe("degraded",);
    expect(health.model,).toBeUndefined();
  });

  it("reports down with the error message when the request fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED",);
    }) as unknown as typeof fetch;

    const health = await healthCheckDispatch(makeState({},),);
    expect(health.status,).toBe("down",);
    expect(health.error,).toBe("ECONNREFUSED",);
    expect(typeof health.latencyMs,).toBe("number",);
  });
});
