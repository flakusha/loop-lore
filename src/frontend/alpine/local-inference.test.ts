// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import {
  cleanupDraftLocally,
  detectLocalInferenceSupport,
  isLocalInferenceOptedIn,
  LOCAL_INFERENCE_OPTIN_KEY,
  LocalInferenceUnavailable,
  runLocalPromptImprove,
  setLocalInferenceOptIn,
  shouldOffloadTask,
} from "./local-inference";

const webgpu = { webgpu: true, wasm: true, indexedDB: true, };
const wasmOnly = { webgpu: false, wasm: true, indexedDB: true, };
const incapable = { webgpu: false, wasm: false, indexedDB: false, };

/** In-memory localStorage twin; swapped in for each test. */
interface MemoryStorage {
  store: Map<string, string>;
  restore: () => void;
}
function installMemoryStorage(): MemoryStorage {
  const g = globalThis as unknown as { localStorage?: Storage };
  const original = g.localStorage;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k,) => store.get(k,) ?? null,
    setItem: (k, v,) => {
      store.set(k, String(v,),);
    },
    removeItem: (k,) => {
      store.delete(k,);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
  return {
    store,
    restore: () => {
      g.localStorage = original;
    },
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = installMemoryStorage();
},);
afterAll(() => {
  storage.restore();
},);

describe("local-inference opt-in gating", () => {
  test("defaults to off and never offloads while off", () => {
    expect(isLocalInferenceOptedIn(),).toBe(false,);
    expect(shouldOffloadTask("prompt-improve", { optedIn: false, support: webgpu, },),).toBe(false,);
  });

  test("opt-in persists and gates offload", () => {
    setLocalInferenceOptIn(true,);
    expect(storage.store.get(LOCAL_INFERENCE_OPTIN_KEY,),).toBe("1",);
    expect(isLocalInferenceOptedIn(),).toBe(true,);
    expect(shouldOffloadTask("prompt-improve", { support: incapable, },),).toBe(false,);
    setLocalInferenceOptIn(false,);
    expect(isLocalInferenceOptedIn(),).toBe(false,);
  });

  test("offloads eligible tasks only when opted in on a capable device", () => {
    expect(shouldOffloadTask("prompt-improve", { optedIn: true, support: webgpu, },),).toBe(true,);
    expect(shouldOffloadTask("prompt-analyze", { optedIn: true, support: wasmOnly, },),).toBe(true,);
    expect(shouldOffloadTask("prompt-improve", { optedIn: true, support: incapable, },),).toBe(false,);
  });

  test("never offloads main generation or unknown tasks", () => {
    expect(shouldOffloadTask("generate", { optedIn: true, support: webgpu, },),).toBe(false,);
    expect(shouldOffloadTask("", { optedIn: true, support: webgpu, },),).toBe(false,);
  });

  test("capability detection reports flags without throwing", () => {
    const support = detectLocalInferenceSupport({ gpu: {}, wasm: {}, indexedDB: {}, },);
    expect(support,).toEqual({ webgpu: true, wasm: true, indexedDB: true, },);
    const none = detectLocalInferenceSupport({ gpu: null, wasm: null, indexedDB: null, },);
    expect(none,).toEqual({ webgpu: false, wasm: false, indexedDB: false, },);
  });
});

describe("runLocalPromptImprove", () => {
  test("spellcheck cleans locally without a server round-trip", () => {
    const result = runLocalPromptImprove({ text: "hello   world ,  test", level: "spellcheck", },);
    expect(result.content,).toBe("hello world, test",);
    expect(result.local,).toBe(true,);
    expect(result.engine,).toBe("local-heuristics",);
  });

  test("model-backed levels signal fallback instead of failing", () => {
    expect(() => runLocalPromptImprove({ text: "hi", level: "creative", },))
      .toThrow(LocalInferenceUnavailable,);
    expect(() => runLocalPromptImprove({ text: "hi", level: "style-chat", },))
      .toThrow(LocalInferenceUnavailable,);
  });

  test("cleanup is idempotent on already-clean drafts", () => {
    expect(cleanupDraftLocally("clean draft.",),).toBe("clean draft.",);
    expect(cleanupDraftLocally("  padded  ",),).toBe("padded",);
  });
});
