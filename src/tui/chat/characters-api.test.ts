// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

import { createChatWithCharacter, listCharacters, } from "./characters-api";
import { dispatchCharacterCommand, } from "./characters-commands";
import type { ChatHost, } from "./types";

interface Capture {
  url: string;
  method: string | undefined;
  body: unknown;
}

/** Bun augments fetch with `preconnect`; a plain stub needs this cast. */
function asFetch(respond: () => Promise<Response>,): typeof fetch {
  return respond as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;
let captures: Capture[];

beforeEach(() => {
  captures = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    const url = String(input,);
    captures.push({
      url,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body,) : init?.body,
    },);

    if (url.includes("/actors",)) {
      return new Response(
        JSON.stringify({
          data: [{ id: "actor-1", display_name: "Alice", },],
          pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1, },
        },),
        { status: 200, headers: { "Content-Type": "application/json", }, },
      );
    }

    return new Response(JSON.stringify({ id: "chat-99", },), {
      status: 201,
      headers: { "Content-Type": "application/json", },
    },);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

describe("TUI character list/select", () => {
  it("lists through GET /api/v1/actors with type=character", async () => {
    const result = await listCharacters({ page: 2, pageSize: 10, sessionToken: "tok", },);
    expect(result.ok,).toBe(true,);
    expect(captures[0]?.url,).toBe("http://localhost:3000/api/v1/actors?type=character&page=2&pageSize=10",);
    expect(captures[0]?.method,).toBeUndefined();
    if (result.ok) {
      expect(result.data.data[0]?.display_name,).toBe("Alice",);
    }
  });

  it("creates a chat with the selected actor in participantIds", async () => {
    const result = await createChatWithCharacter({ name: "Alice", actorId: "actor-1", },);
    expect(result,).toEqual({ ok: true, chatId: "chat-99", },);
    expect(captures[0]?.url,).toBe("http://localhost:3000/api/v1/chats",);
    expect(captures[0]?.method,).toBe("POST",);
    expect(captures[0]?.body,).toEqual({ name: "Alice", participantIds: ["actor-1",], },);
  });
});

/** Bare host surface the character dispatcher touches, with assertion sinks. */
function commandHost() {
  const state = { errors: [] as string[], messages: [] as { content: string }[], };
  const host = {
    chatId: "chat-1",
    sessionToken: "tok" as string | undefined,
    showError(message: string,) {
      state.errors.push(message,);
    },
    addMessage(message: { content: string },) {
      state.messages.push(message,);
    },
  } as unknown as ChatHost;

  return { host, state, };
}

describe("dispatchCharacterCommand", () => {
  it("leaves unrelated text to the plain message path", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchCharacterCommand(host, "/help",),).toBe(false,);
    expect(state.errors,).toEqual([],);
    expect(state.messages,).toEqual([],);
  });

  it("lists the current page with numbered rows and a selection hint", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchCharacterCommand(host, "/chars",),).toBe(true,);
    expect(state.messages[0]?.content,).toBe(
      "Characters:\n1. Alice (actor-1)\n/chars <n> to start a chat.",
    );
  });

  it("creates a chat from the selected row", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchCharacterCommand(host, "/chars 1",),).toBe(true,);
    expect(state.messages[0]?.content,).toBe(
      "Chat with Alice created: chat-99. Select it from the chat picker.",
    );

    expect(captures[1]?.body,).toEqual({ name: "Alice", participantIds: ["actor-1",], },);
  });

  it("reports an out-of-range selection instead of creating a chat", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchCharacterCommand(host, "/chars 9",),).toBe(true,);
    expect(state.errors,).toEqual([
      "No character #9 on this page. Run /chars to list.",
    ],);

    expect(state.messages,).toEqual([],);
  });

  it("reports an unparseable selection", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchCharacterCommand(host, "/chars abc",),).toBe(true,);
    expect(state.errors,).toEqual([
      "No character #abc on this page. Run /chars to list.",
    ],);
  });

  it("reports an empty character list", async () => {
    const { host, state, } = commandHost();
    const originalFetch = globalThis.fetch;
    const emptyBody = JSON.stringify({ data: [], },);
    globalThis.fetch = asFetch(async () =>
      new Response(emptyBody, {
        status: 200,
        headers: { "Content-Type": "application/json", },
      },)
    );

    try {
      expect(await dispatchCharacterCommand(host, "/chars",),).toBe(true,);
      expect(state.messages[0]?.content,).toBe("No characters found.",);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
