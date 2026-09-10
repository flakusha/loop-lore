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
import { isEngineResponse, } from "./local-engine-protocol";
import { LocalInferenceUnavailable, } from "./local-inference";

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
