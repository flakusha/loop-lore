// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Delegation-branch coverage for the shared provider base class
 * (src/generation/providers/base.ts).
 *
 * A concrete test subclass wires stub dispatchers: URL validation,
 * base-URL normalization, state construction, method delegation, and
 * both embed paths (unsupported → 501, supported → delegate).
 */
import { describe, expect, test, } from "bun:test";
import type { ProviderInstanceConfig, } from "../../config/schema";
import { BaseProvider, type BaseProviderDispatchers, type BaseProviderState, } from "./base";
import type {
  GenerateRequest,
  GenerateResponse,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "./types";
import { ProviderError, } from "./types";

const CAPABILITIES: ProviderCapabilities = {
  type: "openai-compatible",
  label: "Branch Test Provider",
  text: true,
  image: false,
  embeddings: false,
  streaming: true,
  tools: false,
  thinking: false,
};

const RESPONSE: GenerateResponse = {
  content: "ok",
  thinking: undefined,
  finishReason: "stop",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
};

/** Minimal provider request — mirrors the shape used in registry tests. */
function makeReq(): GenerateRequest {
  return {
    model: "m",
    messages: [],
    params: {},
  } as unknown as GenerateRequest;
}

/** Base instance config; callers override the base URL per case. */
function makeInstance(overrides?: Partial<ProviderInstanceConfig>,): ProviderInstanceConfig {
  return {
    name: "sm-cov-base",
    label: "Base Test",
    baseUrl: "http://localhost:8080/v1",
    model: "test-model",
    timeout: 1000,
    retries: 2,
    allowUserApiKey: false,
    models: {},
    ...overrides,
  };
}

interface TestState extends BaseProviderState {
  marker?: string;
}

/** Concrete subclass exposing captured dispatcher state for assertions. */
class TestProvider extends BaseProvider<TestState> {
  public seen: { method: string; state: TestState }[] = [];

  constructor(
    config: ProviderInstanceConfig,
    dispatchers?: Partial<BaseProviderDispatchers<TestState>>,
    options?: { defaultBaseUrl?: string; withMarker?: boolean },
  ) {
    const seen = [] as { method: string; state: TestState }[];
    const wrap = <A extends unknown[], R,>(
      method: string,
      fn: (state: TestState, ...args: A) => Promise<R>,
    ): (state: TestState, ...args: A) => Promise<R> => {
      return async (state: TestState, ...args: A): Promise<R> => {
        seen.push({ method, state, },);
        return fn(state, ...args,);
      };
    };
    super(config, {
      capabilities: CAPABILITIES,
      defaultBaseUrl: options?.defaultBaseUrl,
      buildState: options?.withMarker
        ? (base,) => ({ ...base, marker: "built", })
        : undefined,
      dispatchers: {
        complete: wrap("complete", async () => RESPONSE,),
        stream: wrap("stream", async () => RESPONSE,),
        healthCheck: wrap("healthCheck", async () => ({ status: "ok" as const, }),),
        listModels: wrap("listModels", async () => [{ id: "m", },] as ModelInfo[],),
        ...dispatchers,
      },
    },);
    this.seen = seen;
  }
}

describe("BaseProvider construction", () => {
  test("strips trailing slashes from the base URL", async () => {
    const provider = new TestProvider(makeInstance({ baseUrl: "http://localhost:8080/v1///", },),);
    await provider.complete(makeReq(),);
    expect(provider.seen[0]?.state.baseUrl,).toBe("http://localhost:8080/v1",);
  });

  test("falls back to the default base URL when config leaves it empty", async () => {
    const provider = new TestProvider(makeInstance({ baseUrl: "", },), undefined, {
      defaultBaseUrl: "http://localhost:9999/v1",
    },);
    await provider.complete(makeReq(),);
    expect(provider.seen[0]?.state.baseUrl,).toBe("http://localhost:9999/v1",);
  });

  test("throws ProviderError for an unparseable URL", () => {
    expect(() => new TestProvider(makeInstance({ baseUrl: "not a url", },),))
      .toThrow(ProviderError,);
  });

  test("buildState maps the shared state to the concrete shape", async () => {
    const provider = new TestProvider(makeInstance(), undefined, { withMarker: true, },);
    await provider.complete(makeReq(),);
    expect(provider.seen[0]?.state.marker,).toBe("built",);
    expect(provider.seen[0]?.state.defaultModel,).toBe("test-model",);
    expect(provider.seen[0]?.state.timeout,).toBe(1000,);
  });
});

describe("BaseProvider delegation", () => {
  test("complete/stream/healthCheck/listModels delegate with provider state", async () => {
    const provider = new TestProvider(makeInstance(),);
    const req = makeReq();
    const handler: StreamHandler = () => {};
    await expect(provider.complete(req,),).resolves.toBe(RESPONSE,);
    await expect(provider.stream(req, handler,),).resolves.toBe(RESPONSE,);
    await expect(provider.healthCheck(),).resolves.toEqual({ status: "ok", },);
    await expect(provider.listModels(),).resolves.toEqual([{ id: "m", },],);
    expect(provider.seen.map((s,) => s.method),).toEqual([
      "complete",
      "stream",
      "healthCheck",
      "listModels",
    ],);
  });

  test("embed throws a 501 ProviderError without dispatcher support", async () => {
    const provider = new TestProvider(makeInstance(),);
    let thrown: unknown;
    try {
      await provider.embed("hello",);
    } catch (error) {
      thrown = error;
    }
    expect(thrown,).toBeInstanceOf(ProviderError,);
    expect((thrown as ProviderError).statusCode,).toBe(501,);
  });

  test("embed delegates to the dispatcher with the default model", async () => {
    const calls: { input: string | string[]; model: string }[] = [];
    const provider = new TestProvider(makeInstance(), {
      embed: async (_state, input, model,) => {
        calls.push({ input, model, },);
        return [[0.1, 0.2,],];
      },
    },);
    await expect(provider.embed(["a", "b",],),).resolves.toEqual([[0.1, 0.2,],],);
    expect(calls,).toEqual([{ input: ["a", "b",], model: "test-model", },],);
  });
});
