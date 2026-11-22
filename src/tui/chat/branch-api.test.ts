// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

import { createBranch, listBranches, mergeBranch, reuniteChats, splitChat, } from "./branch-api";
import { dispatchBranchCommand, } from "./branch-commands";
import type { ChatHost, } from "./types";

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

/** Bare host surface the branch dispatcher touches, with assertion sinks. */
function commandHost(chatId: string | null = "chat-1",) {
  const state = { errors: [] as string[], messages: [] as { content: string }[], };
  const host = {
    chatId,
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

/** Stub every branch request with one `{ data }` envelope; record the urls. */
function answerWith(data: unknown,) {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request,) => {
    calls.push(String(input,),);
    return new Response(JSON.stringify({ data, },), {
      status: 200,
      headers: { "Content-Type": "application/json", },
    },);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("dispatchBranchCommand", () => {
  it("leaves unrelated text to the plain message path", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchBranchCommand(host, "/help",),).toBe(false,);
    expect(state.errors,).toEqual([],);
    expect(state.messages,).toEqual([],);
  });

  it("reports a missing active chat before calling the API", async () => {
    const { host, state, } = commandHost(null,);
    expect(await dispatchBranchCommand(host, "/branch",),).toBe(true,);
    expect(state.errors,).toEqual(["No active chat. Create or select a chat first.",],);
  });

  it("renders the active marker and message counts of each branch", async () => {
    const { host, state, } = commandHost();
    const answer = answerWith({
      branches: [
        { id: "b-1", name: "main", isActive: true, messageCount: 3, lastActivity: null, },
        { id: "b-2", name: "alt", isActive: false, messageCount: 1, lastActivity: null, },
      ],
      nextCursor: null,
    },);

    try {
      expect(await dispatchBranchCommand(host, "/branch",),).toBe(true,);
      expect(state.messages[0]?.content,).toBe(
        "Branches:\n* b-1 main (3 messages)\n  b-2 alt (1 messages)",
      );

      expect(answer.calls[0],).toContain("/api/v1/chats/chat-1/branches",);
    } finally {
      answer.restore();
    }
  });

  it("renders the empty-list message without touching branch rows", async () => {
    const { host, state, } = commandHost();
    const answer = answerWith({ branches: [], nextCursor: null, },);
    try {
      expect(await dispatchBranchCommand(host, "/branch",),).toBe(true,);
      expect(state.messages[0]?.content,).toBe("No branches yet.",);
    } finally {
      answer.restore();
    }
  });

  it("rejects a fork with no message id before any request", async () => {
    const { host, state, } = commandHost();
    const answer = answerWith({},);
    try {
      expect(await dispatchBranchCommand(host, "/branch create",),).toBe(true,);
      expect(state.errors,).toEqual(["Usage: /branch create <messageId> [name]",],);
      expect(answer.calls,).toEqual([],);
    } finally {
      answer.restore();
    }
  });

  it("renders a created fork with its name and id", async () => {
    const { host, state, } = commandHost();
    const answer = answerWith({ branch: { id: "b-9", name: "alt", }, messagePath: [], },);
    try {
      expect(await dispatchBranchCommand(host, "/branch create msg-1 alt",),).toBe(true,);
      expect(state.messages[0]?.content,).toBe("Branch alt (b-9) created.",);
      expect(answer.calls[0],).toContain("/api/v1/chats/chat-1/branches",);
    } finally {
      answer.restore();
    }
  });

  it("rejects malformed split JSON with the usage hint", async () => {
    const { host, state, } = commandHost();
    const answer = answerWith({},);
    try {
      expect(await dispatchBranchCommand(host, "/split nope",),).toBe(true,);
      expect(state.errors,).toEqual(['Usage: /split [{"locationId":"...","actorIds":["..."]}]',],);
      expect(answer.calls,).toEqual([],);
    } finally {
      answer.restore();
    }
  });

  it("requires a secondary chat id for reunite", async () => {
    const { host, state, } = commandHost();
    expect(await dispatchBranchCommand(host, "/reunite",),).toBe(true,);
    expect(state.errors,).toEqual(["Usage: /reunite <secondaryChatId>",],);
  });
});
