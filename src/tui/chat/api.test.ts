// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/api.ts — handleSend / loadMessages contract coverage.
 * Global fetch is stubbed; no network is touched.
 */
import { afterEach, describe, expect, it, } from "bun:test";
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
  [CAPTURE_KEY]?: Captured;
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
}

/** Minimal ChatHost stub. Blessed types are cast via `as unknown as …`
 * since the test environment is non-TTY; the dispatcher module only
 * branches on host's plain-data fields (chatId, sessionToken, cursor,
 * isSending, messages, itemCount). */
function makeHost(overrides: Partial<ChatHost> = {},): ChatHost & HostExtras {
  const showErrorMessages: string[] = [];
  const addedMessages: ChatMessage[] = [];
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
    itemCount: 0,
    isSending: false,
    sessionToken: undefined,
    cursor: null,
    addMessage(message: ChatMessage,) {
      addedMessages.push(message,);
    },
    scrollToBottom() {/* no-op */},
    showTyping() {/* no-op */},
    hideTyping() {/* no-op */},
    showError(message: string,) {
      showErrorMessages.push(message,);
    },
    showErrorMessages,
    addedMessages,
    ...overrides,
  };
  return host;
}

function stubFetchJson(status: number, payload: unknown,): void {
  setFetch(async (url: string | URL | Request, init?: RequestInit,) => {
    const captured: Captured = {
      url: String(url,),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: Object.fromEntries(new Headers(init?.headers,).entries(),),
      body: typeof init?.body === "string" ? init?.body : "",
    };
    (globalThis as CaptureGlobal)[CAPTURE_KEY] = captured;
    return new Response(JSON.stringify(payload,), {
      status,
      headers: { "Content-Type": "application/json", },
    },);
  },);
}

function getCaptured(): Captured {
  const cap = (globalThis as CaptureGlobal)[CAPTURE_KEY];
  if (!cap) { throw new Error("No captured request — fetch stub was not invoked",); }
  return cap;
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
    expect(captured.url,).toBe("http://localhost:3000/api/chats/chat-1/messages",);
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
    stubFetchJson(200, { id: "msg-1", },);
    const host = makeHost({ sessionToken: undefined, },);
    await handleSend(host, "hello",);
    const captured = getCaptured();
    expect(captured.headers["authorization"],).toBeUndefined();
    expect(host.addedMessages,).toEqual([{ id: "msg-1", role: "user", content: "hello", },],);
  });

  it("adds only the user message when the response has no assistantMessage", async () => {
    stubFetchJson(200, { id: "msg-1", },);
    const host = makeHost({ sessionToken: "tok", },);
    await handleSend(host, "hi",);
    expect(host.addedMessages,).toEqual([{ id: "msg-1", role: "user", content: "hi", },],);
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
    expect(host.messages,).toEqual([],);
  });

  it("fetches the messages URL without cursor on the first call", async () => {
    stubFetchJson(200, {
      data: [{ id: "m1", role: "user", content: "hi", }, { id: "m2", role: "assistant", content: "yo", },],
      cursor: null,
    },);
    await loadMessages(makeHost({ sessionToken: "tok", },),);
    const captured = getCaptured();
    expect(captured.url,).toBe("http://localhost:3000/api/chats/chat-1/messages?pageSize=200",);
    expect(captured.method,).toBe("GET",);
    expect(captured.headers["authorization"],).toBe("Bearer tok",);
  });

  it("appends cursor to the URL on subsequent calls", async () => {
    stubFetchJson(200, { data: [], cursor: "next-cursor", },);
    const host = makeHost({ cursor: "current-cursor", },);
    await loadMessages(host,);
    const captured = getCaptured();
    expect(captured.url,).toBe("http://localhost:3000/api/chats/chat-1/messages?pageSize=200&cursor=current-cursor",);
  });

  it("prepends older messages when host.messages is non-empty", async () => {
    stubFetchJson(200, { data: [{ id: "old1", role: "user", content: "first", },], cursor: null, },);
    const host = makeHost({ messages: [{ id: "new1", role: "user", content: "latest", },], itemCount: 1, },);
    await loadMessages(host,);
    expect(host.messages.map((m,) => m.id),).toEqual(["old1", "new1",],);
    expect(host.itemCount,).toBe(2,);
  });

  it("replaces host.messages when previously empty", async () => {
    stubFetchJson(200, { data: [{ id: "m1", role: "user", content: "a", },], cursor: null, },);
    const host = makeHost();
    await loadMessages(host,);
    expect(host.messages.map((m,) => m.id),).toEqual(["m1",],);
  });

  it("updates host.cursor from the response", async () => {
    stubFetchJson(200, { data: [], cursor: "new-cursor", },);
    const host = makeHost({ cursor: "old-cursor", },);
    await loadMessages(host,);
    expect(host.cursor,).toBe("new-cursor",);
  });

  it("routes a 4xx response to showError with status-aware message", async () => {
    stubFetchJson(401, { error: "unauthorized", },);
    const host = makeHost();
    await loadMessages(host,);
    expect(host.showErrorMessages,).toEqual(["Failed to load messages (HTTP 401)",],);
  });

  it("routes a network throw to showError", async () => {
    setFetch(async () => {
      throw new Error("netfail",);
    },);
    const host = makeHost();
    await loadMessages(host,);
    expect(host.showErrorMessages,).toEqual(["Network error loading messages: netfail",],);
  });
});
