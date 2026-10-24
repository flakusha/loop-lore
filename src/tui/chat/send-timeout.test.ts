// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests that `handleSend` passes a send timeout to the HTTP client.
 *
 * `timeout` is a safeFetch OPTION, not a RequestInit field, so stubbing
 * `globalThis.fetch` (as chat/api.test.ts does) cannot observe it — the value
 * is consumed inside safeFetch before any Request is built. This suite uses
 * the `setFetch` seam from ./api instead, the same seam harness/api.test.ts
 * uses, and asserts on the options object handed to the client.
 *
 * The regression this pins: a send with no `timeout` inherited
 * DEFAULT_TIMEOUT (30s) while the POST blocks on a whole assistant generation
 * server-side, so long RPG turns surfaced a phantom "Request timed out" for
 * replies the server had actually completed.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import { handleSend, setFetch, } from "./api";
import type { ChatHost, ChatMessage, } from "./types";

/** One recorded client call. */
interface ClientCall {
  url: string;
  options: SafeFetchOptions;
}

/** Real client restored after each test. */
const realFetch = safeFetch;

/** Calls recorded by the stub during a test, in order. */
const calls: ClientCall[] = [];

/** Minimal ChatHost — the dispatcher only reads plain-data fields. */
function makeHost(overrides: Partial<ChatHost> = {},): ChatHost {
  const noop = (): void => {};
  return {
    screen: { render: noop, } as unknown as ChatHost["screen"],
    messageList: {
      setItems: noop,
      addItem: noop,
      clearItems: noop,
      popItem: noop,
      select: noop,
    } as unknown as ChatHost["messageList"],
    chatId: "chat-1",
    messages: [] as ChatMessage[],
    isSending: false,
    sessionToken: undefined,
    sendTimeoutMs: 300_000,
    addMessage: noop,
    setMessages: noop,
    scrollToBottom: noop,
    showTyping: noop,
    hideTyping: noop,
    showError: noop,
    ...overrides,
  };
}

/** Record every call and answer with a minimal success envelope.
 *
 * Generic over the response body so it satisfies `setFetch`'s
 * `<T>(url, options?) => Promise<FetchResult<T>>` signature, the same shape
 * harness/api.test.ts's `makeMockSafeFetch<T>` uses. The cast is confined to
 * the double's return; the recorded call is what the tests assert on.
 */
function stubClient(): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: true,
      data: { id: "msg-1", assistantMessage: { id: "msg-2", content: "reply", }, } as T,
      status: 200,
      headers: new Headers(),
    },);
  },);
}

afterEach(() => {
  calls.length = 0;
  setFetch(realFetch,);
},);

describe("handleSend — send timeout", () => {
  it("passes the host's sendTimeoutMs to the client", async () => {
    stubClient();
    await handleSend(makeHost({ sendTimeoutMs: 120_000, },), "hello",);

    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.options.timeout,).toBe(120_000,);
  });

  it("uses the host timeout verbatim rather than the shared 30s default", async () => {
    stubClient();
    await handleSend(makeHost({ sendTimeoutMs: 45_000, },), "hello",);

    expect(calls[0]?.options.timeout,).toBe(45_000,);
  });

  it("carries the message body and auth alongside the timeout", async () => {
    stubClient();
    await handleSend(makeHost({ sessionToken: "tok-1", sendTimeoutMs: 90_000, },), "hi",);

    const call = calls[0];
    expect(call?.url,).toContain("/api/v1/chats/chat-1/messages",);
    expect(call?.options.method,).toBe("POST",);
    expect(call?.options.timeout,).toBe(90_000,);
    expect(call?.options.auth,).toEqual({ sessionToken: "tok-1", },);
  });
});
