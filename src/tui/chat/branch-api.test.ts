// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

import { createBranch, listBranches, mergeBranch, reuniteChats, splitChat, } from "./branch-api";

interface Capture {
  url: string;
  method: string | undefined;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let capture: Capture | undefined;

beforeEach(() => {
  capture = undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
    capture = {
      url: String(input,),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body,) : init?.body,
    };

    return new Response(JSON.stringify({ data: {}, },), {
      status: 200,
      headers: { "Content-Type": "application/json", },
    },);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

describe("TUI branch command request shapes", () => {
  it("lists branches with the shipped limit/cursor query", async () => {
    const result = await listBranches({ chatId: "chat/1", limit: 10, cursor: "next", },);
    expect(result.ok,).toBe(true,);
    expect(capture?.url,).toBe("http://localhost:3000/api/v1/chats/chat%2F1/branches?limit=10&cursor=next",);
    expect(capture?.method,).toBe("GET",);
  });

  it("creates a branch with the fork body", async () => {
    await createBranch({ chatId: "chat-1", messageId: "msg-1", name: "alt", sessionToken: "tok", },);
    expect(capture?.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/branches",);
    expect(capture?.method,).toBe("POST",);
    expect(capture?.body,).toEqual({ messageId: "msg-1", name: "alt", },);
  });

  it("omits an unnamed fork's optional name", async () => {
    await createBranch({ chatId: "chat-1", messageId: "msg-1", },);
    expect(capture?.body,).toEqual({ messageId: "msg-1", },);
  });

  it("merges through the branch id with the optional target", async () => {
    await mergeBranch({ chatId: "chat-1", branchId: "branch/2", intoBranchId: "main", },);
    expect(capture?.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/branches/branch%2F2/merge",);
    expect(capture?.method,).toBe("POST",);
    expect(capture?.body,).toEqual({ intoBranchId: "main", },);
  });

  it("merges into the active branch with an empty body", async () => {
    await mergeBranch({ chatId: "chat-1", branchId: "b-2", },);
    expect(capture?.body,).toEqual({},);
  });

  it("splits with the route's branch descriptors", async () => {
    const branches = [{ locationId: "loc-1", actorIds: ["a-1",], name: "north", },];
    await splitChat({ chatId: "chat-1", branches, },);
    expect(capture?.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/split",);
    expect(capture?.method,).toBe("POST",);
    expect(capture?.body,).toEqual({ branches, },);
  });

  it("reunites with the secondary chat id", async () => {
    await reuniteChats({ chatId: "chat-1", secondaryChatId: "chat-2", },);
    expect(capture?.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/reunite",);
    expect(capture?.method,).toBe("POST",);
    expect(capture?.body,).toEqual({ secondaryChatId: "chat-2", },);
  });
});
