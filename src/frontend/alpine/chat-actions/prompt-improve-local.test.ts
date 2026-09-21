// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * improvePrompt local-first branch — opted-in spellcheck runs in the browser
 * without a server round-trip; everything else falls through to the server.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { LOCAL_INFERENCE_OPTIN_KEY, } from "../local-inference";
import type { ChatState, } from "../types";
import { promptImproveActions, } from "./prompt-improve";

import type { ApiFetchMock, } from "../../tests/test-types";

const globals = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  localStorage?: Storage;
};
const originalFetch = globals.apiFetch;
const originalStorage = globals.localStorage;

/** Minimal ChatState twin for improvePrompt. */
interface ImproveCtx {
  activeChat: string | null;
  isGroupChat: boolean;
  _improving: boolean;
  _promptImproveBackup: string | undefined;
  $refs: { messageInput: { value: string } };
  autoResize: (el: unknown,) => void;
  dispatched: { event: string; detail: unknown }[];
  $dispatch: (event: string, detail?: unknown,) => void;
}

function buildCtx(text: string,): ImproveCtx {
  const ctx: ImproveCtx = {
    activeChat: "chat-1",
    isGroupChat: false,
    _improving: false,
    _promptImproveBackup: undefined,
    $refs: { messageInput: { value: text, }, },
    autoResize: () => {},
    dispatched: [],
    $dispatch: (event, detail,) => {
      ctx.dispatched.push({ event, detail, },);
    },
  };
  return ctx;
}

let fetchCalls: string[] = [];
let store: Map<string, string>;

beforeEach(() => {
  fetchCalls = [];
  store = new Map<string, string>();
  globals.apiFetch = (url,) => {
    fetchCalls.push(url,);
    return Promise.resolve(Response.json({ data: { content: "server-polished", }, },),);
  };
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

function improve(ctx: ImproveCtx, level?: string,): Promise<void> {
  return promptImproveActions.improvePrompt!.call(ctx as unknown as ChatState, level,);
}

describe("improvePrompt local-first", () => {
  test("opted-in spellcheck cleans locally with no server call", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    const ctx = buildCtx("hello   world ,  test",);
    await improve(ctx, "spellcheck",);
    expect(ctx.$refs.messageInput.value,).toBe("hello world, test",);
    expect(ctx._promptImproveBackup,).toBe("hello   world ,  test",);
    expect(fetchCalls,).toEqual([],);
    expect(ctx._improving,).toBe(false,);
  });

  test("opted-out spellcheck goes to the server", async () => {
    const ctx = buildCtx("hello   world",);
    await improve(ctx, "spellcheck",);
    expect(fetchCalls,).toEqual(["/api/v1/generation/prompt",],);
    expect(ctx.$refs.messageInput.value,).toBe("server-polished",);
  });

  test("opted-in model-backed level falls back to the server", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    const ctx = buildCtx("hello world",);
    await improve(ctx, "creative",);
    expect(fetchCalls,).toEqual(["/api/v1/generation/prompt",],);
    expect(ctx.$refs.messageInput.value,).toBe("server-polished",);
  });

  test("opted-in default level (style-chat) falls back to the server", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    const ctx = buildCtx("hello world",);
    await improve(ctx,);
    expect(fetchCalls,).toEqual(["/api/v1/generation/prompt",],);
  });
});
describe("improvePrompt guards + server errors", () => {
  test("empty draft returns without a call", async () => {
    const ctx = buildCtx("   ",);
    await improve(ctx, "spellcheck",);
    expect(fetchCalls,).toEqual([],);
  });
  test("missing chat warns without a call", async () => {
    const ctx = buildCtx("hello",);
    ctx.activeChat = null;
    await improve(ctx, "spellcheck",);
    expect(fetchCalls,).toEqual([],);
    expect(ctx.dispatched[0]?.event,).toBe("show-toast",);
  });
  test("server error surfaces message + resets flag", async () => {
    globals.apiFetch = (url,) => {
      fetchCalls.push(url,);
      return Promise.resolve(new Response(JSON.stringify({ message: "bad", },), { status: 500, },),);
    };
    const ctx = buildCtx("hello",);
    await improve(ctx, "wording",);
    expect(ctx.$refs.messageInput.value,).toBe("hello",);
    expect(ctx._improving,).toBe(false,);
  });
  test("empty server content surfaces failure", async () => {
    globals.apiFetch = (url,) => {
      fetchCalls.push(url,);
      return Promise.resolve(Response.json({ data: {}, },),);
    };
    const ctx = buildCtx("hello",);
    await improve(ctx, "wording",);
    expect(ctx._promptImproveBackup,).toBeUndefined();
  });
  test("network throw surfaces failure + resets flag", async () => {
    globals.apiFetch = () => Promise.reject(new Error("down",),);
    const ctx = buildCtx("hello",);
    await improve(ctx, "wording",);
    expect(ctx._improving,).toBe(false,);
    expect(ctx.dispatched.at(-1,)?.event,).toBe("show-toast",);
  });
});
describe("restorePromptDraft", () => {
  test("restores backup then no-ops when empty", async () => {
    const ctx = buildCtx("new",);
    ctx._promptImproveBackup = "old";
    promptImproveActions.restorePromptDraft!.call(ctx as unknown as ChatState,);
    expect(ctx.$refs.messageInput.value,).toBe("old",);
    expect(ctx._promptImproveBackup,).toBeUndefined();
    promptImproveActions.restorePromptDraft!.call(ctx as unknown as ChatState,);
    expect(ctx.$refs.messageInput.value,).toBe("old",);
  });
});
