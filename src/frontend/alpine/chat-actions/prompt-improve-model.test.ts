// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * improvePrompt model-backed branch — an opted-in, downloaded browser model
 * serves the level with zero server calls; anything missing falls through.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { getLocalEngine, resetLocalEngine, } from "../local-engine";
import { LOCAL_INFERENCE_OPTIN_KEY, } from "../local-inference";
import { markModelReady, } from "../local-model-improve";
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

/** Fake Worker twin — answers load/generate on behalf of the browser model. */
interface FakeWorker {
  onmessage: ((event: { data: unknown },) => void) | null;
  posted: unknown[];
  postMessage: (message: unknown,) => void;
  terminate: () => void;
  respond: (response: unknown,) => void;
}

let fetchCalls: string[] = [];
let store: Map<string, string>;
let fake: FakeWorker;
let generatedText: string;

function improve(ctx: ImproveCtx, level?: string,): Promise<void> {
  const fn = promptImproveActions.improvePrompt;
  if (!fn) { throw new Error("improvePrompt missing",); }
  return fn.call(ctx as unknown as ChatState, level,);
}

beforeEach(() => {
  fetchCalls = [];
  store = new Map<string, string>();
  generatedText = "model-polished";
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
    length: 0,
  } as Storage;
  const twin: FakeWorker = {
    onmessage: null,
    posted: [],
    postMessage: (message,) => {
      twin.posted.push(message,);
    },
    terminate: () => {
      twin.onmessage = null;
    },
    respond: (response,) => {
      twin.onmessage?.({ data: response, },);
    },
  };
  fake = twin;
  resetLocalEngine();
  getLocalEngine({ workerFactory: () => twin as unknown as Worker, },);
},);

afterEach(() => {
  resetLocalEngine();
  globals.apiFetch = originalFetch;
  globals.localStorage = originalStorage;
},);

/** Answer every pending worker request until the action settles. */
async function drive(action: Promise<void>, ctx: ImproveCtx, original: string,): Promise<void> {
  let settled = false;
  const tracked = action.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  let answered = 0;
  // Pure microtask flushing: every engine continuation is promise-driven,
  // so each round answers new posts and yields — no wall-clock waits.
  for (let round = 0; round < 200 && !settled; round++) {
    while (answered < fake.posted.length) {
      const message = fake.posted[answered] as { kind: string; id: number };
      answered += 1;
      if (message.kind === "load") {
        fake.respond({ kind: "ready", id: message.id, engine: "transformers-webgpu", },);
      } else if (message.kind === "generate") {
        fake.respond({ kind: "generated", id: message.id, text: generatedText, },);
      }
    }
    if (ctx.$refs.messageInput.value !== original || fetchCalls.length > 0) {
      await tracked;
      return;
    }
    await Promise.resolve();
  }
  await tracked;
}

describe("improvePrompt model-backed branch", () => {
  test("downloaded model serves the level with no server call", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    markModelReady("SmolLM2-360M-Instruct",);
    const ctx = buildCtx("hello world",);
    await drive(improve(ctx, "wording",), ctx, "hello world",);
    expect(fetchCalls,).toEqual([],);
    expect(ctx.$refs.messageInput.value,).toBe("model-polished",);
    expect(ctx._promptImproveBackup,).toBe("hello world",);
  });

  test("missing download falls back to the server", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    const ctx = buildCtx("hello world",);
    await drive(improve(ctx, "wording",), ctx, "hello world",);
    expect(fetchCalls,).toEqual(["/api/generation/prompt",],);
    expect(ctx.$refs.messageInput.value,).toBe("server-polished",);
  });

  test("empty model output falls back to the server", async () => {
    store.set(LOCAL_INFERENCE_OPTIN_KEY, "1",);
    markModelReady("SmolLM2-360M-Instruct",);
    generatedText = "   ";
    const ctx = buildCtx("hello world",);
    await drive(improve(ctx, "wording",), ctx, "hello world",);
    expect(fetchCalls,).toEqual(["/api/generation/prompt",],);
    expect(ctx.$refs.messageInput.value,).toBe("server-polished",);
  });
});
