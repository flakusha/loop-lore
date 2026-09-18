// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Basic shape check for the browser-test mock LLM provider helper.
 *
 * Per TASK-browser-test-fixture-no-mock-llm-provider: register the mock so
 * browser flows that trigger generation don't hit the real network. This
 * test verifies the helper wires the provider correctly without running the
 * full e2e fixture (just shape + canned responses).
 */

import { getProvider, listProviders, } from "@/generation";
import { describe, expect, test, } from "bun:test";
import {
  installMockLlmProvider,
  MOCK_MODEL_ID,
  MOCK_PROVIDER_NAME,
  MockLLMProvider,
  useMockLlmProvider,
} from "./mock-llm-provider";

function listNames(): string[] {
  return listProviders().map((p,) => p.name);
}

describe("MockLLMProvider helper — basic shape", () => {
  test("exports the canonical mock provider + name/model constants", () => {
    expect(MOCK_PROVIDER_NAME,).toBe("mock-provider",);
    expect(MOCK_MODEL_ID,).toBe("mock-model",);
    expect(typeof MockLLMProvider,).toBe("function",);
  });

  test("installMockLlmProvider registers a usable provider in the registry", () => {
    const config = {
      generation: {
        defaultProvider: "openai",
        defaultModels: {},
        providers: { openaiCompatible: [], },
      },
    } as unknown as Parameters<typeof installMockLlmProvider>[0];

    installMockLlmProvider(config,);

    // Registry now contains the mock.
    expect(listNames(),).toContain(MOCK_PROVIDER_NAME,);
    const got = getProvider(MOCK_PROVIDER_NAME,);
    expect(got,).toBeDefined();

    // Config mutated to force the mock as default.
    expect(config.generation.defaultProvider,).toBe(MOCK_PROVIDER_NAME,);
    expect(config.generation.defaultModels[MOCK_PROVIDER_NAME],).toBe(MOCK_MODEL_ID,);
  });

  test("useMockLlmProvider runs initializeProviders and returns the mock", () => {
    const config = {
      generation: {
        defaultProvider: "openai",
        defaultModels: {},
        providers: { openaiCompatible: [], },
      },
    } as unknown as Parameters<typeof useMockLlmProvider>[0];

    const mock = useMockLlmProvider(config,);
    expect(mock,).toBeInstanceOf(MockLLMProvider,);
    expect(listNames(),).toContain(MOCK_PROVIDER_NAME,);
  });

  test("mock instance returns canned complete() response", async () => {
    const mock = new MockLLMProvider();
    const res = await mock.complete({ model: "mock-model", messages: [], params: {}, },);
    expect(res.content,).toBeTruthy();
    expect(res.finishReason,).toBe("stop",);
    expect(res.usage.totalTokens,).toBe(30,);
  });

  test("mock stream() emits content chunks then a done event", async () => {
    const mock = new MockLLMProvider();
    const chunks: string[] = [];
    await mock.stream({ model: "mock-model", messages: [], params: {}, }, (chunk,) => {
      if (chunk.type === "content" && chunk.content) { chunks.push(chunk.content,); }
    },);
    expect(chunks.join("",),).toContain("Mock",);
    expect(chunks.join("",),).toContain("streamed",);
  });

  test("mock failOnCall throws synchronously on complete()", () => {
    // complete() throws before returning a Promise, so the call itself throws.
    const mock = new MockLLMProvider();
    mock.failOnCall = true;
    expect(() => mock.complete({ model: "mock-model", messages: [], params: {}, },))
      .toThrow("Mock provider failure",);
  });
});
