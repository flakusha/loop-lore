// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the chat-list filter server sync (chat-filters-server.ts).
 *
 * Every function takes an injectable fetcher, so these drive real Request
 * objects through stub responders — no network, no module mocking (Bun's
 * module registry is process-global and has no unmock, per the HandlerOpts
 * note in src/routes/chats/types.ts).
 */
import { describe, expect, test, } from "bun:test";
import type { ChatFilterFetcher, ChatFilterFields, ChatFilterSnapshot, } from "./chat-filters-server";
import {
  applyChatFilterSnapshot,
  fetchChatFilters,
  reconcileChatFiltersFromServer,
  saveChatFilters,
  toChatFilterSnapshot,
} from "./chat-filters-server";

const SNAPSHOT: ChatFilterSnapshot = {
  type: "direct",
  status: "archived",
  sort: "unread",
  world: "w-uuid",
  minMessages: 4,
  maxMessages: 40,
  updatedSince: "2026-03-01T00:00:00.000Z",
};

const FIELDS: ChatFilterFields = {
  _chatType: "direct",
  _chatStatus: "archived",
  _chatSort: "unread",
  _chatWorld: "w-uuid",
  _chatMinMessages: "4",
  _chatMaxMessages: "40",
  _chatUpdatedSince: "2026-03-01T00:00:00.000Z",
};

/** @param status @param body @returns a fetcher answering one JSON response */
function responder(status: number, body: unknown,): ChatFilterFetcher {
  return async () => new Response(JSON.stringify(body,), { status, },);
}

/** Fetcher that records its calls and answers `status` with `body`. */
function recorder(
  status: number,
  body: unknown,
): { fetcher: ChatFilterFetcher; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    fetcher: async (url, init,) => {
      calls.push({ url, init, },);
      return new Response(JSON.stringify(body,), { status, },);
    },
  };
}

const rejector: ChatFilterFetcher = async () => {
  throw new Error("offline",);
};

describe("toChatFilterSnapshot / applyChatFilterSnapshot", () => {
  test("component fields map to the full snapshot shape", () => {
    expect(toChatFilterSnapshot(FIELDS,),).toEqual(SNAPSHOT,);
  });

  test("cleared fields map to all-clear snapshot values", () => {
    expect(toChatFilterSnapshot({
      _chatType: "all",
      _chatStatus: "all",
      _chatSort: "recent",
      _chatWorld: "",
      _chatMinMessages: "",
      _chatMaxMessages: "",
      _chatUpdatedSince: "",
    },),).toEqual({
      type: "all",
      status: "all",
      sort: "recent",
      world: null,
      minMessages: null,
      maxMessages: null,
      updatedSince: null,
    },);
  });

  test("garbage numeric bounds and unknown enums fall back to defaults", () => {
    expect(toChatFilterSnapshot({
      ...FIELDS,
      _chatType: "secret",
      _chatMinMessages: "lots",
      _chatMaxMessages: "-3",
    },),).toEqual({ ...SNAPSHOT, type: "all", minMessages: null, maxMessages: null, },);
  });

  test("float bounds truncate to integers", () => {
    expect(toChatFilterSnapshot({ ...FIELDS, _chatMinMessages: "7.9", },).minMessages,).toBe(7,);
  });

  test("applyChatFilterSnapshot writes the component fields (nulls clear)", () => {
    const state: ChatFilterFields = { ...FIELDS, };
    applyChatFilterSnapshot(state, {
      type: "all",
      status: "all",
      sort: "recent",
      world: null,
      minMessages: null,
      maxMessages: null,
      updatedSince: null,
    },);

    expect(state,).toEqual({
      _chatType: "all",
      _chatStatus: "all",
      _chatSort: "recent",
      _chatWorld: "",
      _chatMinMessages: "",
      _chatMaxMessages: "",
      _chatUpdatedSince: "",
    },);
  });
});

describe("fetchChatFilters", () => {
  test("maps the server envelope onto a full snapshot", async () => {
    const snapshot = await fetchChatFilters(responder(200, { data: SNAPSHOT, },),);
    expect(snapshot,).toEqual(SNAPSHOT,);
  });

  test("partial payloads fall back to defaults per field", async () => {
    const snapshot = await fetchChatFilters(responder(200, { data: { type: "group", }, },),);
    expect(snapshot,).toEqual({
      type: "group",
      status: "all",
      sort: "recent",
      world: null,
      minMessages: null,
      maxMessages: null,
      updatedSince: null,
    },);
  });

  test("non-200, malformed JSON, and thrown fetches resolve to null", async () => {
    expect(await fetchChatFilters(responder(401, { message: "no", },),),).toBeNull();
    expect(
      await fetchChatFilters(async () => new Response("not json", { status: 200, },)),
    ).toBeNull();

    expect(await fetchChatFilters(rejector,),).toBeNull();
  });
});

describe("saveChatFilters", () => {
  test("PUTs the snapshot JSON to /api/v1/chats/filters", async () => {
    const { fetcher, calls, } = recorder(200, { data: SNAPSHOT, },);
    expect(await saveChatFilters(SNAPSHOT, fetcher,),).toBe(true,);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.url,).toBe("/api/v1/chats/filters",);
    expect(calls[0]?.init?.method,).toBe("PUT",);
    expect(JSON.parse(String(calls[0]?.init?.body,),),).toEqual(SNAPSHOT,);
  });

  test("422 and thrown fetches resolve to false", async () => {
    expect(await saveChatFilters(SNAPSHOT, responder(422, { message: "bad", },),),).toBe(false,);
    expect(await saveChatFilters(SNAPSHOT, rejector,),).toBe(false,);
  });
});

describe("reconcileChatFiltersFromServer", () => {
  test("applies the fetched snapshot onto the component state", async () => {
    const state: ChatFilterFields = {
      _chatType: "all",
      _chatStatus: "all",
      _chatSort: "recent",
      _chatWorld: "",
      _chatMinMessages: "",
      _chatMaxMessages: "",
      _chatUpdatedSince: "",
    };

    // The reconcile path uses the default apiFetch; exercise it through the
    // exported helpers' shared mapping instead: fetch (injected) + apply.
    const snapshot = await fetchChatFilters(responder(200, { data: SNAPSHOT, },),);
    applyChatFilterSnapshot(state, snapshot as ChatFilterSnapshot,);
    expect(state,).toEqual(FIELDS,);
  });

  test("a failed fetch leaves the state untouched (fire-and-forget contract)", async () => {
    const state: ChatFilterFields = { ...FIELDS, };
    await reconcileWithRejector(state,);
    expect(state,).toEqual(FIELDS,);
  });
});

/** Drives reconcileChatFiltersFromServer through a throwing global fetch. */
async function reconcileWithRejector(state: ChatFilterFields,): Promise<void> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = rejector as typeof fetch;
  try {
    await reconcileChatFiltersFromServer(state,);
  } finally {
    globalThis.fetch = realFetch;
  }
}
