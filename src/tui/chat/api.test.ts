// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/api.ts — handleSend / loadMessages contract coverage.
 * Global fetch is stubbed; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { TUI_DEFAULTS, } from "../../config/sections/tui";
import { handleSend, loadMessages, } from "./api";
import type { ChatHost, ChatMessage, } from "./types";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

const originalFetch = globalThis.fetch;

/** No-op screen stub: blessed screen has a `render()` method called in
 * `handleSend`'s finally block. We never instantiate real blessed widgets
 * here (the test env is non-TTY) — a minimal object suffices. */
function makeScreen(): ChatHost["screen"] {
  return { render: () => {}, } as unknown as ChatHost["screen"];
}

/** Marker key on `globalThis` to surface the most recent captured request
 * back to the calling test without threading through function args. */
const CAPTURE_KEY = "__tui_chat_captured__" as const;

interface CaptureGlobal {
  [CAPTURE_KEY]?: Captured[];
}

/** Type cast used only for stubbing blessed widget refs and fetch in tests
 * — the test environment is non-TTY and the actual widget instances are
 * never exercised; only the dispatcher module's branching on host's plain
 * data fields matters here. */
type StubFetch = ((...args: never[]) => unknown) | ((...args: never[]) => Promise<unknown>);

function setFetch(stub: StubFetch,): void {
  globalThis.fetch = stub as unknown as typeof fetch;
}

interface HostExtras {
  showErrorMessages: string[];
  addedMessages: ChatMessage[];
  /** One entry per `setMessages` call: the pages the dispatcher handed the list. */
  rendered: ChatMessage[][];
}

/** Minimal ChatHost stub. Blessed types are cast via `as unknown as …`
 * since the test environment is non-TTY; the dispatcher module only
 * branches on host's plain-data fields (chatId, sessionToken, isSending) and
 * drives the list through the callbacks. */
function makeHost(overrides: Partial<ChatHost> = {},): ChatHost & HostExtras {
  const showErrorMessages: string[] = [];
  const addedMessages: ChatMessage[] = [];
  const rendered: ChatMessage[][] = [];
  const host: ChatHost & HostExtras = {
    screen: makeScreen(),
    messageList: {
      setItems: () => {},
      addItem: () => {},
      clearItems: () => {},
      popItem: () => {},
      select: () => {},
    } as unknown as ChatHost["messageList"],
    chatId: "chat-1",
    messages: [],
    isSending: false,
    sessionToken: undefined,
    sendTimeoutMs: TUI_DEFAULTS.sendTimeoutMs,
    addMessage(message: ChatMessage,) {
      addedMessages.push(message,);
    },
    setMessages(messages: ChatMessage[],) {
      rendered.push(messages,);
    },
    scrollToBottom() {/* no-op */},
    showTyping() {/* no-op */},
    hideTyping() {/* no-op */},
    showError(message: string,) {
      showErrorMessages.push(message,);
    },
    showErrorMessages,
    addedMessages,
    rendered,
    ...overrides,
  };

  return host;
}

/** Flatten a `HeadersInit` into a plain record. Bun's `Headers` global does
 * not expose `.entries()` at the type level under `tsconfig.backend.json`
 * (BunHeadersOverride narrows the DOM interface), so we read whichever
 * shape the caller passed instead of going through `new Headers(...).entries()`. */
function headersToRecord(init: HeadersInit | undefined,): Record<string, string> {
  if (!init) { return {}; }
  if (init instanceof Headers) {
    const out: Record<string, string> = {};
    init.forEach((value, key,) => {
      out[key] = value;
    },);

    return out;
  }

  if (Array.isArray(init,)) {
    const out: Record<string, string> = {};
    for (const [key, value,] of init) { out[key] = value; }
    return out;
  }

  return { ...init, };
}

function stubFetchJson(status: number, payload: unknown,): void {
  setFetch(async (url: string | URL | Request, init?: RequestInit,) => {
    recordRequest(url, init,);
    return new Response(JSON.stringify(payload,), {
      status,
      headers: { "Content-Type": "application/json", },
    },);
  },);
}

/** Answer successive calls with successive payloads; the last one repeats. */
function stubFetchJsonSequence(status: number, payloads: unknown[],): void {
  let call = 0;
  setFetch(async (url: string | URL | Request, init?: RequestInit,) => {
    recordRequest(url, init,);
    const payload = payloads[Math.min(call, payloads.length - 1,)];
    call++;
    return new Response(JSON.stringify(payload,), {
      status,
      headers: { "Content-Type": "application/json", },
    },);
  },);
}

function recordRequest(url: string | URL | Request, init: RequestInit | undefined,): void {
  const log = (globalThis as CaptureGlobal)[CAPTURE_KEY] ?? [];
  log.push({
    url: String(url,),
    method: (init?.method ?? "GET").toUpperCase(),
    headers: headersToRecord(init?.headers,),
    body: typeof init?.body === "string" ? init?.body : "",
  },);

  (globalThis as CaptureGlobal)[CAPTURE_KEY] = log;
}

function getCaptured(): Captured {
  const cap = allCaptured().at(-1,);
  if (!cap) { throw new Error("No captured request — fetch stub was not invoked",); }
  return cap;
}

/** Every request the stub saw, oldest first. */
function allCaptured(): Captured[] {
  return (globalThis as CaptureGlobal)[CAPTURE_KEY] ?? [];
}

function fetchMustNotBeCalled(): StubFetch {
  return () => {
    throw new Error("fetch must not be called",);
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as CaptureGlobal)[CAPTURE_KEY];
},);

describe("handleSend", () => {
  it("shows an error and returns without sending when no chatId is set", async () => {
    const host = makeHost({ chatId: null, },);
    setFetch(fetchMustNotBeCalled(),);
    await handleSend(host, "hello",);
    expect(host.showErrorMessages,).toEqual(["No active chat. Create or select a chat first.",],);
  });

  it("returns without sending when isSending is already true", async () => {
    const host = makeHost({ isSending: true, },);
    setFetch(fetchMustNotBeCalled(),);
    await handleSend(host, "hello",);
    expect(host.showErrorMessages,).toEqual([],);
  });

  it("sends the typed text with Authorization header when sessionToken is set", async () => {
    stubFetchJson(200, { id: "msg-1", assistantMessage: { id: "msg-2", content: "hi back", }, },);
    const host = makeHost({ sessionToken: "tok-abc", },);
    await handleSend(host, "hello world",);
    const captured = getCaptured();
    expect(captured.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/messages",);
    expect(captured.method,).toBe("POST",);
    expect(captured.headers["authorization"],).toBe("Bearer tok-abc",);
    expect(captured.headers["content-type"],).toBe("application/json",);
    expect(JSON.parse(captured.body,),).toEqual({ content: "hello world", role: "user", },);
    expect(host.addedMessages,).toEqual([
      { id: "msg-1", role: "user", content: "hello world", },
      { id: "msg-2", role: "assistant", content: "hi back", },
    ],);

    expect(host.isSending,).toBe(false,);
  });

  it("omits Authorization when sessionToken is undefined", async () => {
    stubFetchJsonSequence(200, [
      { id: "msg-1", },
      { data: [{ id: "msg-1", role: "user", content: "hello", },], },
    ],);

    const host = makeHost({ sessionToken: undefined, },);
    await handleSend(host, "hello",);
    const captured = getCaptured();
    expect(captured.headers["authorization"],).toBeUndefined();
    expect(host.addedMessages,).toEqual([{ id: "msg-1", role: "user", content: "hello", },],);
  });

  it("adds only the user message when the response has no assistantMessage", async () => {
    stubFetchJsonSequence(200, [
      { id: "msg-1", },
      { data: [{ id: "msg-1", role: "user", content: "hi", },], },
    ],);

    const host = makeHost({ sessionToken: "tok", },);
    await handleSend(host, "hi",);
    expect(host.addedMessages,).toEqual([{ id: "msg-1", role: "user", content: "hi", },],);
  });

  it("refreshes the transcript when the LLM path omits assistantMessage", async () => {
    stubFetchJsonSequence(200, [
      { id: "msg-1", },
      {
        data: [
          { id: "msg-1", role: "user", content: "hi", },
          { id: "msg-2", role: "assistant", content: "streamed reply", },
        ],
      },
    ],);

    const host = makeHost({ sessionToken: "tok", },);
    await handleSend(host, "hi",);
    expect(host.rendered,).toHaveLength(1,);
    expect(host.rendered[0]!.map((m,) => m.content),).toEqual(["hi", "streamed reply",],);
  });

  it("routes a 4xx response to showError and resets isSending", async () => {
    stubFetchJson(422, { error: "validation failed", },);
    const host = makeHost({ sessionToken: "tok", },);
    await handleSend(host, "hi",);
    expect(host.showErrorMessages.length,).toBe(1,);
    expect(host.showErrorMessages[0],).toContain("HTTP 422",);
    expect(host.isSending,).toBe(false,);
    expect(host.addedMessages,).toEqual([],);
  });

  it("routes a network throw to showError and resets isSending", async () => {
    setFetch(async () => {
      throw new Error("ECONNREFUSED",);
    },);

    const host = makeHost({ sessionToken: "tok", },);
    await handleSend(host, "hi",);
    expect(host.showErrorMessages,).toEqual(["ECONNREFUSED",],);
    expect(host.isSending,).toBe(false,);
  });
});

describe("loadMessages", () => {
  it("returns early without calling fetch when no chatId is set", async () => {
    setFetch(fetchMustNotBeCalled(),);
    const host = makeHost({ chatId: null, },);
    await loadMessages(host,);
    expect(host.rendered,).toEqual([],);
  });

  it("asks for page 1 at the page size it renders, with the bearer token", async () => {
    stubFetchJson(200, {
      data: [{ id: "m1", role: "user", content: "hi", }, { id: "m2", role: "assistant", content: "yo", },],
      pagination: { total: 2, page: 1, pageSize: 200, totalPages: 1, },
    },);

    const host = makeHost({ sessionToken: "tok", },);
    await loadMessages(host,);

    const captured = getCaptured();
    expect(captured.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/messages?page=1&pageSize=200",);
    expect(captured.method,).toBe("GET",);
    expect(captured.headers["authorization"],).toBe("Bearer tok",);
    // One request for a chat that fits the page, and its rows reach the list.
    expect(allCaptured(),).toHaveLength(1,);
    expect(host.rendered,).toEqual([[
      { id: "m1", role: "user", content: "hi", },
      { id: "m2", role: "assistant", content: "yo", },
    ],],);
  });

  // The defect this pins: the endpoint pages by page/pageSize and its envelope
  // carries the metadata under `pagination`, so a read of page 1 alone showed the
  // OPENING turns of a long chat forever. The TUI now reads the last page.
  it("re-reads the last page when the chat is longer than one page", async () => {
    const firstPage = {
      data: [{ id: "m1", role: "user", content: "oldest", },],
      pagination: { total: 250, page: 1, pageSize: 200, totalPages: 2, },
    };

    const lastPage = {
      data: [{ id: "m49", role: "user", content: "newest", }, { id: "m50", role: "assistant", content: "reply", },],
      pagination: { total: 250, page: 2, pageSize: 200, totalPages: 2, },
    };

    stubFetchJsonSequence(200, [firstPage, lastPage,],);

    const host = makeHost();
    await loadMessages(host,);

    expect(allCaptured().map((c,) => c.url),).toEqual([
      "http://localhost:3000/api/v1/chats/chat-1/messages?page=1&pageSize=200",
      "http://localhost:3000/api/v1/chats/chat-1/messages?page=2&pageSize=200",
    ],);

    // Only the tail is rendered — and exactly once, never prepended to.
    expect(host.rendered,).toHaveLength(1,);
    expect(host.rendered[0]!.map((m,) => m.content),).toEqual(["newest", "reply",],);
  });

  it("renders an empty list when the chat has no messages", async () => {
    stubFetchJson(200, {
      data: [],
      pagination: { total: 0, page: 1, pageSize: 200, totalPages: 0, },
    },);

    const host = makeHost();
    await loadMessages(host,);

    expect(host.rendered,).toEqual([[],],);
    expect(allCaptured(),).toHaveLength(1,);
  });

  it("reports the failure and renders nothing when the last page read fails", async () => {
    let call = 0;
    setFetch(async () => {
      call++;
      const ok = call === 1;
      return new Response(
        JSON.stringify(
          ok
            ? { data: [], pagination: { total: 900, page: 1, pageSize: 200, totalPages: 5, }, }
            : { error: "boom", },
        ),
        {
          status: ok ? 200 : 500,
          headers: { "Content-Type": "application/json", },
        },
      );
    },);

    const host = makeHost();
    await loadMessages(host,);

    expect(host.showErrorMessages,).toEqual(["Failed to load messages (HTTP 500)",],);
    expect(host.rendered,).toEqual([],);
  });

  it("routes a 4xx response to showError with status-aware message", async () => {
    stubFetchJson(401, { error: "unauthorized", },);
    const host = makeHost();
    await loadMessages(host,);
    expect(host.showErrorMessages,).toEqual(["Failed to load messages (HTTP 401)",],);
    expect(host.rendered,).toEqual([],);
  });

  it("routes a network throw to showError", async () => {
    setFetch(async () => {
      throw new Error("netfail",);
    },);

    const host = makeHost();
    await loadMessages(host,);
    expect(host.showErrorMessages,).toEqual(["Network error loading messages: netfail",],);
  });

  // --- URL encoding tests ---

  it("percent-encodes chatId containing / in handleSend", async () => {
    const host = makeHost({ chatId: "abc/def", },);
    stubFetchJson(201, { id: "m1", },);
    await handleSend(host, "hello",);
    const captured = getCaptured();
    expect(captured.url,).toContain("abc%2Fdef",);
    expect(captured.url,).not.toContain("abc/def",);
  });

  it("percent-encodes chatId containing ? in handleSend", async () => {
    const host = makeHost({ chatId: "abc?def", },);
    stubFetchJson(201, { id: "m1", },);
    await handleSend(host, "hello",);
    const captured = getCaptured();
    expect(captured.url,).toContain("abc%3Fdef",);
  });

  it("percent-encodes chatId in loadMessages", async () => {
    const host = makeHost({ chatId: "abc/def", },);
    stubFetchJson(200, { data: [], pagination: { total: 0, page: 1, pageSize: 200, totalPages: 0, }, },);
    await loadMessages(host,);
    const captured = getCaptured();
    expect(captured.url,).toContain("abc%2Fdef",);
  });
});
