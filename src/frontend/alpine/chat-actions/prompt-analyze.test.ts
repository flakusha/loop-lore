// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * analyzePrompt — display-only analysis: draft untouched, profile rendered
 * to state + toast; guards, local-fallback routing, and failure toasts.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { LOCAL_INFERENCE_OPTIN_KEY, } from "../local-inference";
import type { ChatState, } from "../types";
import { type ChatPromptAnalyzeState, promptAnalyzeActions, } from "./prompt-analyze";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globals = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  localStorage?: Storage;
};
const originalFetch = globals.apiFetch;
const originalStorage = globals.localStorage;

/** Minimal ChatState twin for analyzePrompt. */
interface AnalyzeCtx {
  activeChat: string | null;
  _analyzing: boolean;
  _promptAnalysis: ChatPromptAnalyzeState["_promptAnalysis"];
  $refs: { messageInput: { value: string } };
  dispatched: { event: string; detail: unknown }[];
  $dispatch: (event: string, detail?: unknown,) => void;
}

function buildCtx(text: string,): AnalyzeCtx {
  const ctx: AnalyzeCtx = {
    activeChat: "chat-1",
    _analyzing: false,
    _promptAnalysis: undefined,
    $refs: { messageInput: { value: text, }, },
    dispatched: [],
    $dispatch: (event, detail,) => {
      ctx.dispatched.push({ event, detail, },);
    },
  };
  return ctx;
}

function toastOf(ctx: AnalyzeCtx,): { type: string; message: string } {
  return ctx.dispatched.at(-1,)?.detail as { type: string; message: string };
}

const PROFILE = {
  intent: "question",
  clarity: 0.42,
  issues: ["vague",],
  suggestions: ["name the tavern",],
  confidence: 0.9,
};

let calls: { url: string; body: string }[] = [];
let store: Map<string, string>;

function stubFetch(handler: ApiFetchMock,): void {
  globals.apiFetch = (url, opts,) => {
    calls.push({ url, body: String(opts?.body ?? "",), },);
    return handler(url, opts,);
  };
}

function stubAnalysis(): void {
  stubFetch(() => Promise.resolve(Response.json({ data: { analysis: PROFILE, }, },),));
}

beforeEach(() => {
  calls = [];
  store = new Map<string, string>();
  stubAnalysis();
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
    get length() {
      return store.size;
    },
  } as Storage;
},);
afterEach(() => {
  globals.apiFetch = originalFetch;
  globals.localStorage = originalStorage;
},);
afterAll(() => {
  globals.apiFetch = originalFetch;
  globals.localStorage = originalStorage;
},);

function analyze(ctx: AnalyzeCtx,): Promise<void> {
  return promptAnalyzeActions.analyzePrompt!.call(ctx as unknown as ChatState,);
}

describe("analyzePrompt server path", () => {
  test("posts mode analyze and renders profile without touching draft", async () => {
    const ctx = buildCtx("  where to?  ",);
    await analyze(ctx,);
    expect(calls.length,).toBe(1,);
    expect(calls[0]?.url,).toBe("/api/generation/prompt",);
    expect(JSON.parse(calls[0]?.body ?? "{}",),).toMatchObject({
      mode: "analyze",
      text: "where to?",
      chatId: "chat-1",
    },);
    expect(ctx.$refs.messageInput.value,).toBe("  where to?  ",);
    expect(ctx._promptAnalysis,).toEqual(PROFILE,);
    expect(ctx._analyzing,).toBe(false,);
    const toast = toastOf(ctx,);
    expect(ctx.dispatched.at(-1,)?.event,).toBe("show-toast",);
    expect(toast.type,).toBe("success",);
    expect(toast.message,).toContain("question",);
    expect(toast.message,).toContain("name the tavern",);
  });

  test("opted-in analyze falls back to the server (no local instruction yet)", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    const ctx = buildCtx("hello world",);
    await analyze(ctx,);
    expect(calls.length,).toBe(1,);
    expect(ctx._promptAnalysis,).toEqual(PROFILE,);
    expect(ctx.$refs.messageInput.value,).toBe("hello world",);
  });
});
describe("analyzePrompt guards", () => {
  test("empty draft returns without a call", async () => {
    const ctx = buildCtx("   ",);
    await analyze(ctx,);
    expect(calls,).toEqual([],);
    expect(ctx.dispatched,).toEqual([],);
  });
  test("missing chat warns without a call", async () => {
    const ctx = buildCtx("hello",);
    ctx.activeChat = null;
    await analyze(ctx,);
    expect(calls,).toEqual([],);
    expect(ctx.dispatched[0]?.event,).toBe("show-toast",);
    expect(toastOf(ctx,).type,).toBe("warning",);
    expect(ctx._analyzing,).toBe(false,);
  });
  test("in-flight analyze is not re-entered", async () => {
    const ctx = buildCtx("hello",);
    ctx._analyzing = true;
    await analyze(ctx,);
    expect(calls,).toEqual([],);
  });
});
describe("analyzePrompt failures", () => {
  test("server error surfaces failure toast + resets flag", async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ message: "bad", },), { status: 500, },),));
    const ctx = buildCtx("hello",);
    await analyze(ctx,);
    expect(toastOf(ctx,).type,).toBe("error",);
    expect(ctx._promptAnalysis,).toBeUndefined();
    expect(ctx.$refs.messageInput.value,).toBe("hello",);
    expect(ctx._analyzing,).toBe(false,);
  });
  test("injection block surfaces blocked message", async () => {
    stubFetch(() =>
      Promise.resolve(Response.json(
        { error: "injection_detected", message: "Text rejected: prompt injection detected.", },
        { status: 403, },
      ),)
    );
    const ctx = buildCtx("hello",);
    await analyze(ctx,);
    expect(toastOf(ctx,).type,).toBe("error",);
    expect(ctx._promptAnalysis,).toBeUndefined();
    expect(ctx._analyzing,).toBe(false,);
  });
  test("missing analysis payload surfaces failure", async () => {
    stubFetch(() => Promise.resolve(Response.json({ data: {}, },),));
    const ctx = buildCtx("hello",);
    await analyze(ctx,);
    expect(toastOf(ctx,).type,).toBe("error",);
    expect(ctx._promptAnalysis,).toBeUndefined();
  });
  test("network throw surfaces failure + resets flag", async () => {
    stubFetch(() => Promise.reject(new Error("down",),));
    const ctx = buildCtx("hello",);
    await analyze(ctx,);
    expect(toastOf(ctx,).type,).toBe("error",);
    expect(ctx._analyzing,).toBe(false,);
  });
});
describe("clearPromptAnalysis", () => {
  test("clears displayed profile, draft untouched", async () => {
    const ctx = buildCtx("hello",);
    await analyze(ctx,);
    expect(ctx._promptAnalysis,).toEqual(PROFILE,);
    promptAnalyzeActions.clearPromptAnalysis!.call(ctx as unknown as ChatState,);
    expect(ctx._promptAnalysis,).toBeUndefined();
    expect(ctx.$refs.messageInput.value,).toBe("hello",);
  });
});
