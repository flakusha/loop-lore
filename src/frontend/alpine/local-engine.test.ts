// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model engine — fake-worker coverage for load/generate lifecycle,
 * timeouts, error mapping, progress routing, and output normalization.
 * The real worker bundle (`local-engine.worker.js`) is browser-only and
 * intentionally never imported here.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createLocalEngine, resetLocalEngine, } from "./local-engine";
import {
  ENGINE_WORKER_URL,
  isEngineResponse,
  TRANSFORMERS_CDN,
  WLLAMA_CDN,
  WLLAMA_ENGINE_WORKER_URL,
  WLLAMA_WASM_URL,
} from "./local-engine-protocol";
import { isModelReady, LocalInferenceUnavailable, } from "./local-inference";

/** Fake Worker twin — engine drives it via postMessage, tests answer. */
interface FakeWorker {
  onmessage: ((event: { data: unknown },) => void) | null;
  posted: unknown[];
  factoryCalls: number;
  postMessage: (message: unknown,) => void;
  terminate: () => void;
  respond: (response: unknown,) => void;
}

function createFake(): FakeWorker {
  const fake: FakeWorker = {
    onmessage: null,
    posted: [],
    factoryCalls: 0,
    postMessage: (message,) => {
      fake.posted.push(message,);
    },
    terminate: () => {
      fake.onmessage = null;
    },
    respond: (response,) => {
      fake.onmessage?.({ data: response, },);
    },
  };
  return fake;
}

interface Posted {
  kind: string;
  id: number;
}

beforeEach(() => {
  resetLocalEngine();
},);

afterEach(() => {
  resetLocalEngine();
},);

describe("createLocalEngine lifecycle", () => {
  test("unknown model rejects without spawning a worker", async () => {
    let spawned = 0;
    const engine = createLocalEngine({
      workerFactory: () => {
        spawned++;
        return createFake() as unknown as Worker;
      },
    },);
    await expect(engine.loadModel("nope",),).rejects.toBeInstanceOf(LocalInferenceUnavailable,);
    expect(spawned,).toBe(0,);
    expect(engine.loadedModel(),).toBeNull();
  });

  test("load resolves ready, caches, second load is a no-op", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const pending = engine.loadModel("SmolLM2-360M-Instruct",);
    const first = fake.posted[0] as Posted;
    expect(first.kind,).toBe("load",);
    fake.respond({ kind: "ready", id: first.id, engine: "transformers-webgpu", },);
    await expect(pending,).resolves.toBe("transformers-webgpu",);
    expect(engine.loadedModel(),).toBe("SmolLM2-360M-Instruct",);
    await expect(engine.loadModel("SmolLM2-360M-Instruct",),).resolves.toBe("transformers-webgpu",);
    expect(fake.posted.length,).toBe(1,);
  });
  test("successful load marks the model ready", async () => {
    const store = new Map<string, string>();
    const globals = globalThis as unknown as { localStorage?: Storage };
    const previous = globals.localStorage;
    globals.localStorage = {
      getItem: (key,) => store.get(key,) ?? null,
      setItem: (key, value,) => {
        store.set(key, String(value,),);
      },
      removeItem: (key,) => {
        store.delete(key,);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    try {
      const fake = createFake();
      const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
      expect(isModelReady("SmolLM2-360M-Instruct",),).toBe(false,);
      const pending = engine.loadModel("SmolLM2-360M-Instruct",);
      fake.respond({ kind: "ready", id: (fake.posted[0] as Posted).id, engine: "transformers-webgpu", },);
      await pending;
      expect(isModelReady("SmolLM2-360M-Instruct",),).toBe(true,);
    } finally {
      globals.localStorage = previous;
    }
  });

  test("progress messages route to the load handler", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const seen: [number, number,][] = [];
    const pending = engine.loadModel("SmolLM2-360M-Instruct", (loaded, total,) => {
      seen.push([loaded, total,],);
    },);
    fake.respond({ kind: "progress", loaded: 10, total: 100, },);
    const first = fake.posted[0] as Posted;
    fake.respond({ kind: "ready", id: first.id, engine: "transformers-wasm", },);
    await pending;
    expect(seen,).toEqual([[10, 100,],],);
  });

  test("generate without a loaded model rejects", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    await expect(engine.generate("hi",),).rejects.toBeInstanceOf(LocalInferenceUnavailable,);
    expect(fake.posted.length,).toBe(0,);
  });

  test("generate posts input and returns raw output", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const loading = engine.loadModel("SmolLM2-360M-Instruct",);
    fake.respond({ kind: "ready", id: (fake.posted[0] as Posted).id, engine: "transformers-webgpu", },);
    await loading;
    const generating = engine.generate([{ role: "user", content: "hi", },], 64,);
    const request = fake.posted[1] as Posted;
    expect(request.kind,).toBe("generate",);
    fake.respond({ kind: "generated", id: request.id, text: "hello there", },);
    await expect(generating,).resolves.toBe("hello there",);
  });

  test("worker error message rejects with LocalInferenceUnavailable", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const pending = engine.loadModel("SmolLM2-360M-Instruct",);
    fake.respond({ kind: "error", id: (fake.posted[0] as Posted).id, message: "boom", },);
    await expect(pending,).rejects.toBeInstanceOf(LocalInferenceUnavailable,);
  });

  test("malformed worker messages are ignored", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const pending = engine.loadModel("SmolLM2-360M-Instruct",);
    fake.respond({ kind: "bogus", },);
    fake.respond(null,);
    const first = fake.posted[0] as Posted;
    fake.respond({ kind: "ready", id: first.id, engine: "transformers-webgpu", },);
    await expect(pending,).resolves.toBe("transformers-webgpu",);
  });

  test("load timeout drops the worker", async () => {
    const fake = createFake();
    const engine = createLocalEngine({
      workerFactory: () => fake as unknown as Worker,
      loadTimeoutMs: 5,
    },);
    await expect(engine.loadModel("SmolLM2-360M-Instruct",),).rejects.toBeInstanceOf(
      LocalInferenceUnavailable,
    );
    expect(engine.loadedModel(),).toBeNull();
  });

  test("terminate clears state; generate afterwards rejects", async () => {
    const fake = createFake();
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    const pending = engine.loadModel("SmolLM2-360M-Instruct",);
    engine.terminate();
    await expect(pending,).rejects.toBeInstanceOf(LocalInferenceUnavailable,);
    await expect(engine.generate("hi",),).rejects.toBeInstanceOf(LocalInferenceUnavailable,);
  });

  test("sync postMessage throw maps to LocalInferenceUnavailable", async () => {
    const fake = createFake();
    fake.postMessage = () => {
      throw new DOMException("not cloneable", "DataCloneError",);
    };
    const engine = createLocalEngine({ workerFactory: () => fake as unknown as Worker, },);
    await expect(engine.loadModel("SmolLM2-360M-Instruct",),).rejects.toBeInstanceOf(
      LocalInferenceUnavailable,
    );
    expect(engine.loadedModel(),).toBeNull();
  });
});

describe("createLocalEngine wllama routing", () => {
  test("wllama load targets the wllama worker with GGUF source and CDN", async () => {
    const fake = createFake();
    const urls: string[] = [];
    const engine = createLocalEngine({
      workerFactory: (url,) => {
        urls.push(url,);
        return fake as unknown as Worker;
      },
    },);
    const pending = engine.loadModel("stories260K-GGUF",);
    expect(urls,).toEqual([WLLAMA_ENGINE_WORKER_URL,],);
    const first = fake.posted[0] as Record<string, unknown>;
    expect(first.kind,).toBe("load",);
    expect(first.cdn,).toBe(WLLAMA_CDN,);
    expect(first.wasmUrl,).toBe(WLLAMA_WASM_URL,);
    expect(first.modelSource,).toEqual({ repo: "ggml-org/models", file: "tinyllamas/stories260K.gguf", },);
    fake.respond({ kind: "ready", id: first.id, engine: "wllama-webgpu", },);
    await expect(pending,).resolves.toBe("wllama-webgpu",);
    expect(engine.loadedModel(),).toBe("stories260K-GGUF",);
  });

  test("transformers load still targets the transformers worker without a GGUF source", async () => {
    const fake = createFake();
    const urls: string[] = [];
    const engine = createLocalEngine({
      workerFactory: (url,) => {
        urls.push(url,);
        return fake as unknown as Worker;
      },
    },);
    const pending = engine.loadModel("SmolLM2-360M-Instruct",);
    expect(urls,).toEqual([ENGINE_WORKER_URL,],);
    const first = fake.posted[0] as Record<string, unknown>;
    expect(first.cdn,).toBe(TRANSFORMERS_CDN,);
    expect("modelSource" in first,).toBe(false,);
    fake.respond({ kind: "ready", id: first.id, engine: "transformers-webgpu", },);
    await pending;
  });

  test("switching engine families recreates the worker", async () => {
    const first = createFake();
    const second = createFake();
    const urls: string[] = [];
    const fakes = [first, second,];
    const engine = createLocalEngine({
      workerFactory: (url,) => {
        urls.push(url,);
        return fakes[urls.length - 1] as unknown as Worker;
      },
    },);
    const loading = engine.loadModel("SmolLM2-360M-Instruct",);
    first.respond({ kind: "ready", id: (first.posted[0] as Posted).id, engine: "transformers-webgpu", },);
    await loading;
    const switching = engine.loadModel("stories260K-GGUF",);
    expect(urls,).toEqual([ENGINE_WORKER_URL, WLLAMA_ENGINE_WORKER_URL,],);
    expect(first.onmessage,).toBeNull();
    second.respond({ kind: "ready", id: (second.posted[0] as Posted).id, engine: "wllama-webgpu", },);
    await expect(switching,).resolves.toBe("wllama-webgpu",);
    expect(engine.loadedModel(),).toBe("stories260K-GGUF",);
  });
});

describe("isEngineResponse", () => {
  test("accepts known shapes, rejects the rest", () => {
    expect(isEngineResponse({ kind: "ready", id: 1, engine: "x", },),).toBe(true,);
    expect(isEngineResponse({ kind: "progress", loaded: 1, total: 2, },),).toBe(true,);
    expect(isEngineResponse({ kind: "error", message: "x", },),).toBe(true,);
    expect(isEngineResponse(null,),).toBe(false,);
    expect(isEngineResponse({ kind: "bogus", },),).toBe(false,);
  });
});
