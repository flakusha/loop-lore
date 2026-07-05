/**
 * Shared Mock LLM Provider — for unit + e2e tests.
 *
 * Implements LLMProvider interface. Configurable failure/stream-error flags.
 * Used by:
 *   - src/generation/generate-route.test.ts (unit)
 *   - tests/e2e/helpers/mocks/llm.ts (e2e, re-exports as MockLLMProvider)
 *
 * Register via registerProvider("name", mock) before use.
 */

import type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
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

export class MockLLMProvider implements LLMProvider {
  private _failOnCall = false;
  private _streamError = false;
  readonly capabilities = MOCK_CAPABILITIES;

  /** Throw ProviderError on complete()/stream() */
  set failOnCall(v: boolean) {
    this._failOnCall = v;
  }
  get failOnCall(): boolean {
    return this._failOnCall;
  }

  /** Throw on stream() specifically */
  set streamError(v: boolean) {
    this._streamError = v;
  }
  get streamError(): boolean {
    return this._streamError;
  }

  complete(_req: GenerateRequest): Promise<GenerateResponse> {
    if (this._failOnCall) throw new Error("Mock provider failure");
    return Promise.resolve({
      content: "Mock response content",
      thinking: undefined,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  }

  stream(
    _req: GenerateRequest,
    handler: StreamHandler,
  ): Promise<GenerateResponse> {
    if (this._streamError) {
      throw new Error("Mock stream failure");
    }
    handler({ type: "content", content: "Mock " });
    handler({ type: "content", content: "streamed " });
    handler({ type: "content", content: "response" });
    handler({
      type: "done",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
    return Promise.resolve({
      content: "Mock streamed response",
      thinking: undefined,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  }

  healthCheck(): Promise<{ status: "ok" }> {
    return Promise.resolve({ status: "ok" as const });
  }

  listModels(): Promise<string[]> {
    return Promise.resolve(["mock-model"]);
  }
}
