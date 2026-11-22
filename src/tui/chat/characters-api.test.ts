// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

import { createChatWithCharacter, listCharacters, } from "./characters-api";

interface Capture {
  url: string;
  method: string | undefined;
  body: unknown;
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
