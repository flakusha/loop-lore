// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared Mock LLM Provider — for unit + e2e tests.
 *
 * Implements LLMProvider interface. Configurable failure/stream-error flags.
 * Used by:
 *   - src/generation/generate-route.test.ts (unit)
 *
 * Register via registerProvider("name", mock) before use.
 */

import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "@/generation/providers/types";

const MOCK_CAPABILITIES: ProviderCapabilities = {
  type: "openai-compatible",
  label: "Mock LLM",
  text: true,
  image: false,
  embeddings: false,
  streaming: true,
  tools: false,
  thinking: false,
};

/** */
export class MockLLMProvider implements LLMProvider {
  private _failOnCall = false;
  private _streamError = false;
  readonly capabilities = MOCK_CAPABILITIES;

  /** Throw ProviderError on complete()/stream() */
  set failOnCall(v: boolean,) {
    this._failOnCall = v;
  }
  /**
   * @returns current `failOnCall` flag.
   */
  get failOnCall(): boolean {
    return this._failOnCall;
  }

  /** Throw on stream() specifically */
  set streamError(v: boolean,) {
    this._streamError = v;
  }
  /**
   * @returns current `streamError` flag.
   */
  get streamError(): boolean {
    return this._streamError;
  }

  /**
   * @param _req - generate request (ignored by the mock)
   * @returns mock `GenerateResponse` with deterministic token usage.
   * @throws {Error} `"Mock provider failure"` when `failOnCall` is set.
   */
  complete(_req: GenerateRequest,): Promise<GenerateResponse> {
    if (this._failOnCall) { throw new Error("Mock provider failure",); }
    return Promise.resolve({
      content: "Mock response content",
      thinking: undefined,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
    },);
  }

  /**
   * @param _req - generate request (ignored by the mock)
   * @param handler - stream handler invoked for each chunk + done event
   * @returns mock `GenerateResponse` describing the streamed completion.
   * @throws {Error} `"Mock stream failure"` when `streamError` is set.
   */
  stream(_req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    if (this._streamError) {
      throw new Error("Mock stream failure",);
    }
    handler({ type: "content", content: "Mock ", },);
    handler({ type: "content", content: "streamed ", },);
    handler({ type: "content", content: "response", },);
    handler({
      type: "done",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
    },);
    return Promise.resolve({
      content: "Mock streamed response",
      thinking: undefined,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
    },);
  }

  /**
   * @returns `{ status: "ok" }` health probe response.
   */
  healthCheck(): Promise<{ status: "ok" }> {
    return Promise.resolve({ status: "ok" as const, },);
  }

  /**
   * @returns array containing a single `"mock-model"` model descriptor.
   */
  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "mock-model", },],);
  }
}
