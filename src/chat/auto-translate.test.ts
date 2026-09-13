// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  autoTranslateText,
  normalizeTargetLang,
  resolveTargetLang,
  setChatTargetLang,
  shouldSkipTranslation,
  STORY_STATE_KEY,
} from "./auto-translate";

describe("resolveTargetLang", () => {
  test("opt-out default: null/empty state resolves to null", () => {
    expect(resolveTargetLang(null,),).toBeNull();
    expect(resolveTargetLang(undefined,),).toBeNull();
    expect(resolveTargetLang("{}",),).toBeNull();
  });

  test('non-object JSON (including "null") resolves to null without throwing', () => {
    expect(resolveTargetLang("null",),).toBeNull();
    expect(resolveTargetLang("42",),).toBeNull();
    expect(resolveTargetLang('"es"',),).toBeNull();
  });

  test("invalid JSON and unknown codes resolve to null", () => {
    expect(resolveTargetLang("not-json",),).toBeNull();
    expect(resolveTargetLang(JSON.stringify({ [STORY_STATE_KEY]: "xx", },),),).toBeNull();
    expect(resolveTargetLang(JSON.stringify({ [STORY_STATE_KEY]: 42, },),),).toBeNull();
  });

  test("known code resolves case-insensitively", () => {
    expect(resolveTargetLang(JSON.stringify({ [STORY_STATE_KEY]: "ES", },),),).toBe("es",);
  });
});

describe("normalizeTargetLang", () => {
  test("empty input is opt-out", () => {
    expect(normalizeTargetLang(null,),).toBeNull();
    expect(normalizeTargetLang("",),).toBeNull();
    expect(normalizeTargetLang("klingon",),).toBeNull();
  });
});

describe("setChatTargetLang persistence roundtrip", () => {
  test("set then resolve roundtrips without clobbering sibling keys", () => {
    const base = JSON.stringify({ isPaused: true, },);
    const next = setChatTargetLang(base, "es",);
    expect(resolveTargetLang(next,),).toBe("es",);
    expect(JSON.parse(next ?? "{}",),).toMatchObject({ isPaused: true, [STORY_STATE_KEY]: "es", },);
  });

  test("clearing removes the key and resolves to null", () => {
    const set = setChatTargetLang(null, "ja",);
    expect(resolveTargetLang(set,),).toBe("ja",);
    const cleared = setChatTargetLang(set, "",);
    expect(resolveTargetLang(cleared,),).toBeNull();
  });
});

describe("shouldSkipTranslation", () => {
  test("blank and language-neutral text always skips", () => {
    expect(shouldSkipTranslation("   ", "es",),).toBe(true,);
    expect(shouldSkipTranslation("123 !!! 🎉", "es",),).toBe(true,);
  });

  test("text already in a non-Latin target script skips", () => {
    expect(shouldSkipTranslation("こんにちは世界", "ja",),).toBe(true,);
  });

  test("latin targets never skip lettered text (no cheap signal)", () => {
    expect(shouldSkipTranslation("hello world", "es",),).toBe(false,);
    expect(shouldSkipTranslation("Hello こんにちは", "ja",),).toBe(false,);
  });
});

describe("autoTranslateText", () => {
  test("opt-out default never calls complete", async () => {
    let calls = 0;
    const out = await autoTranslateText({
      text: "hello",
      storyState: null,
      chatId: "c1",
      deps: {
        complete: async () => {
          calls++;
          return { content: "hola", };
        },
      },
    },);
    expect(out,).toEqual({ text: "hello", translated: false, targetLang: null, },);
    expect(calls,).toBe(0,);
  });

  test("skip-when-same-language never calls complete", async () => {
    let calls = 0;
    const storyState = setChatTargetLang(null, "ja",);
    const out = await autoTranslateText({
      text: "こんにちは世界",
      storyState,
      chatId: "c1",
      deps: {
        complete: async () => {
          calls++;
          return { content: "x", };
        },
      },
    },);
    expect(out.translated,).toBe(false,);
    expect(out.text,).toBe("こんにちは世界",);
    expect(calls,).toBe(0,);
  });

  test("success path returns translated text", async () => {
    const storyState = setChatTargetLang(null, "es",);
    const out = await autoTranslateText({
      text: "hello world",
      storyState,
      chatId: "c1",
      deps: { complete: async () => ({ content: "hola mundo", }), },
    },);
    expect(out,).toEqual({ text: "hola mundo", translated: true, targetLang: "es", },);
  });

  test("rejected complete degrades to the original", async () => {
    const storyState = setChatTargetLang(null, "es",);
    const out = await autoTranslateText({
      text: "hello world",
      storyState,
      chatId: "c1",
      deps: {
        complete: async () => {
          throw new Error("llm down",);
        },
      },
    },);
    expect(out,).toEqual({ text: "hello world", translated: false, targetLang: "es", },);
  });

  test('text containing standalone "to" still takes the <lang> <text> branch', async () => {
    const storyState = setChatTargetLang(null, "es",);
    let sent = "";
    const out = await autoTranslateText({
      text: "I want to travel",
      storyState,
      chatId: "c1",
      deps: {
        complete: async (req,) => {
          sent = JSON.stringify(req,);
          return { content: "quiero viajar", };
        },
      },
    },);
    expect(sent,).toContain("I want to travel",);
    expect(out,).toEqual({ text: "quiero viajar", translated: true, targetLang: "es", },);
  });

  test("missing complete (LLM unwired) degrades to the original", async () => {
    const storyState = setChatTargetLang(null, "es",);
    const out = await autoTranslateText({ text: "hello world", storyState, chatId: "c1", deps: {}, },);
    expect(out,).toEqual({ text: "hello world", translated: false, targetLang: "es", },);
  });

  test('"null" story_state passes through without rejecting', async () => {
    const out = await autoTranslateText({
      text: "hello",
      storyState: "null",
      chatId: "c1",
      deps: { complete: async () => ({ content: "hola", }), },
    },);
    expect(out,).toEqual({ text: "hello", translated: false, targetLang: null, },);
  });

  test("empty LLM content degrades to the original", async () => {
    const storyState = setChatTargetLang(null, "es",);
    const out = await autoTranslateText({
      text: "hello world",
      storyState,
      chatId: "c1",
      deps: { complete: async () => ({ content: "  ", }), },
    },);
    expect(out.text,).toBe("hello world",);
    expect(out.translated,).toBe(false,);
  });
});
