// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatSearch, } from "./search";

// ── Mock apiFetch (chat/search imports ../htmx; keep the real i18n) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("../htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function searchCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    _searchResults: [{ chatId: "stale", chatName: "s", characterName: "c", characterAvatar: null, },],
    _joinableChats: [],
    loadJoinableChats: async () => {},
    loadChats: mock(async () => {},),
    $dispatch: () => {},
    ...overrides,
  };
}

describe("chatSearch.searchChats", () => {
  test("clears results on a blank query without fetching", async () => {
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "   ",);
    expect(ctx._searchResults,).toEqual([],);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("maps array payloads", async () => {
    mockFetch(200, [{ chatId: "c1", chatName: "General", characterName: "Aria", characterAvatar: null, },],);
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "gen",);
    expect(fetchCalls[0]!.url,).toBe("/api/chats/search?q=gen",);
    expect(ctx._searchResults,).toEqual([
      { chatId: "c1", chatName: "General", characterName: "Aria", characterAvatar: null, },
    ],);
  },);

  test("maps { data } payloads and defaults null avatars", async () => {
    mockFetch(200, { data: [{ chatId: "c2", chatName: "Tavern", characterName: "Bob", },], },);
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "tav",);
    expect(ctx._searchResults,).toEqual([
      { chatId: "c2", chatName: "Tavern", characterName: "Bob", characterAvatar: null, },
    ],);
  },);

  test("clears results on non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "x",);
    expect(ctx._searchResults,).toEqual([],);
  },);

  test("clears results on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "x",);
    expect(ctx._searchResults,).toEqual([],);
  },);

  test("encodes unicode queries", async () => {
    mockFetch(200, [],);
    const ctx = searchCtx();
    await chatSearch.searchChats!.call(ctx, "酒場",);
    expect(fetchCalls[0]!.url,).toContain(encodeURIComponent("酒場",),);
  },);
},);

describe("chatSearch.loadJoinableChats", () => {
  test("keeps existing rows on non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = searchCtx({ _joinableChats: [{ chatId: "keep", },], },);
    await chatSearch.loadJoinableChats!.call(ctx,);
    expect(ctx._joinableChats,).toEqual([{ chatId: "keep", },],);
  },);

  test("maps array payloads with defaults", async () => {
    mockFetch(200, [{ chatId: "c1", chatName: "Open", },],);
    const ctx = searchCtx();
    await chatSearch.loadJoinableChats!.call(ctx,);
    expect(ctx._joinableChats,).toEqual([
      { chatId: "c1", chatName: "Open", participantCount: 0, lastActiveAt: null, },
    ],);
  },);

  test("maps { data } payloads", async () => {
    mockFetch(200, {
      data: [{ chatId: "c9", chatName: "Hall", participantCount: 4, lastActiveAt: "t", },],
    },);
    const ctx = searchCtx();
    await chatSearch.loadJoinableChats!.call(ctx,);
    expect(ctx._joinableChats,).toEqual([
      { chatId: "c9", chatName: "Hall", participantCount: 4, lastActiveAt: "t", },
    ],);
  },);

  test("clears rows on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = searchCtx({ _joinableChats: [{ chatId: "stale", },], },);
    await chatSearch.loadJoinableChats!.call(ctx,);
    expect(ctx._joinableChats,).toEqual([],);
  },);
},);

describe("chatSearch.joinChat", () => {
  test("toasts an error when the join fails", async () => {
    mockFetch(403, { error: "no", },);
    const toasts: { type: string; message: string }[] = [];
    const ctx = searchCtx({ $dispatch: (e: string, d: { type: string; message: string },) => {
      if (e === "show-toast") { toasts.push(d,); }
    }, },);
    await chatSearch.joinChat!.call(ctx, "c1",);
    expect(fetchCalls[0]!.url,).toBe("/api/chats/c1/join",);
    expect(toasts[0]?.type,).toBe("error",);
    expect((ctx.loadChats as ReturnType<typeof mock>),).not.toHaveBeenCalled();
  },);

  test("reloads lists and toasts info on success", async () => {
    mockFetch(200, {},);
    const toasts: { type: string; message: string }[] = [];
    let joinableReloads = 0;
    const ctx = searchCtx({
      loadJoinableChats: async () => { joinableReloads++; },
      $dispatch: (e: string, d: { type: string; message: string },) => {
        if (e === "show-toast") { toasts.push(d,); }
      },
    },);
    await chatSearch.joinChat!.call(ctx, "c2",);
    expect(joinableReloads,).toBe(1,);
    expect((ctx.loadChats as ReturnType<typeof mock>),).toHaveBeenCalledTimes(1,);
    expect(toasts[0]?.type,).toBe("info",);
  },);

  test("works without a loadChats implementation", async () => {
    mockFetch(200, {},);
    const ctx = searchCtx({ loadChats: undefined, },);
    await expect(chatSearch.joinChat!.call(ctx, "c3",),).resolves.toBeUndefined();
  },);

  test("toasts an error when a reload rejects", async () => {
    mockFetch(200, {},);
    const toasts: { type: string; message: string }[] = [];
    const ctx = searchCtx({
      loadJoinableChats: async () => {
        throw new Error("reload failed",);
      },
      $dispatch: (e: string, d: { type: string; message: string },) => {
        if (e === "show-toast") { toasts.push(d,); }
      },
    },);
    await chatSearch.joinChat!.call(ctx, "c4",);
    expect(toasts[toasts.length - 1]?.type,).toBe("error",);
  },);
},);
