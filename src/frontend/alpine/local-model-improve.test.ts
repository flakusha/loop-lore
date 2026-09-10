// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model-backed prompt improvement — output normalization and download-gate
 * flags. Engine lifecycle lives in `local-engine.test.ts`; composer wiring
 * in `chat-actions/prompt-improve-model.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  clearModelReady,
  extractGeneratedText,
  isModelReady,
  markModelReady,
} from "./local-model-improve";

const globals = globalThis as unknown as { localStorage?: Storage };
const originalStorage = globals.localStorage;

let store: Map<string, string>;

beforeEach(() => {
  store = new Map<string, string>();
  globals.localStorage = {
    getItem: (k,) => store.get(k,) ?? null,
    setItem: (k, v,) => {
      store.set(k, String(v,),);
    },
    removeItem: (k,) => {
      store.delete(k,);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
},);

afterEach(() => {
  globals.localStorage = originalStorage;
},);

describe("extractGeneratedText", () => {
  test("trims strings and strips echoed prompts", () => {
    expect(extractGeneratedText("  hello  ",),).toBe("hello",);
    expect(extractGeneratedText("draft draft polished", "draft",),).toBe("draft polished",);
    expect(extractGeneratedText(null,),).toBe("",);
  });

  test("reads the last assistant turn from chat output", () => {
    const raw = [
      { role: "user", content: "hi", },
      { role: "assistant", content: "first", },
      { role: "assistant", content: "second", },
    ];
    expect(extractGeneratedText(raw,),).toBe("second",);
    expect(extractGeneratedText({ generated_text: "  out  ", },),).toBe("out",);
  });
});

describe("model readiness flags", () => {
  test("mark/is/clear round-trip", () => {
    expect(isModelReady("SmolLM2-360M-Instruct",),).toBe(false,);
    markModelReady("SmolLM2-360M-Instruct",);
    expect(isModelReady("SmolLM2-360M-Instruct",),).toBe(true,);
    clearModelReady("SmolLM2-360M-Instruct",);
    expect(isModelReady("SmolLM2-360M-Instruct",),).toBe(false,);
  });
});
