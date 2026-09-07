// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatWorld, } from "./world";

// ── Mock apiFetch (chat/world imports ../htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let handler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;

mock.module("../htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!handler) { return new Response("{}", { status: 200, },); }
    return handler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  handler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  handler = null;
},);

function worldCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    _worlds: [],
    _worldsLoading: false,
    _worldChats: {},
    _worldExpanded: {},
    activeChat: null,
    loadWorldChats: chatWorld.loadWorldChats,
    ...overrides,
  };
}

describe("chatWorld.loadWorldChannels", () => {
  test("returns early while already loading", async () => {
    const ctx = worldCtx({ _worldsLoading: true, },);
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("keeps only chat-kind worlds and loads their channels", async () => {
    const loaded: string[] = [];
    handler = async (url,) => {
      if (url === "/api/worlds?pageSize=50") {
        return Response.json({
          data: [
            { id: "w1", name: "Chat World", kind: "chat", },
            { id: "w2", name: "RPG World", kind: "rpg", },
            { id: "w3", name: "No Kind", },
          ],
        },);
      }
      loaded.push(url,);
      return Response.json({ data: [], },);
    };
    const ctx = worldCtx();
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(ctx._worlds,).toEqual([{ id: "w1", name: "Chat World", },],);
    expect(loaded,).toEqual(["/api/worlds/w1/chats",],);
    expect(ctx._worldsLoading,).toBe(false,);
  },);

  test("ignores non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = worldCtx();
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(ctx._worlds,).toEqual([],);
    expect(ctx._worldsLoading,).toBe(false,);
  },);

  test("keeps the tree working when the network fails", async () => {
    handler = () => {
      throw new Error("offline",);
    };
    const ctx = worldCtx();
    await expect(chatWorld.loadWorldChannels!.call(ctx,),).resolves.toBeUndefined();
    expect(ctx._worldsLoading,).toBe(false,);
  },);
},);

describe("chatWorld.loadWorldChats", () => {
  test("stores rows per world", async () => {
    mockFetch(200, { data: [{ id: "c1", },], },);
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toHaveLength(1,);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/chats",);
  },);

  test("keeps previous rows on non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = worldCtx({ _worldChats: { w1: [{ id: "keep", },], }, },);
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([{ id: "keep", },],);
  },);

  test("defaults to an empty list on malformed payloads", async () => {
    mockFetch(200, {},);
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([],);
  },);

  test("clears the world on network error", async () => {
    handler = () => {
      throw new Error("offline",);
    };
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([],);
  },);
},);

describe("chatWorld.toggleWorld", () => {
  test("expands and loads uncached worlds", () => {
    let loaded: string[] = [];
    const ctx = worldCtx({
      _worldExpanded: {},
      _worldChats: {},
      loadWorldChats: (id: string,) => { loaded.push(id,); },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect((ctx._worldExpanded as Record<string, boolean>)["w1"],).toBe(true,);
    expect(loaded,).toEqual(["w1",],);
  },);

  test("collapsing does not reload", () => {
    let loads = 0;
    const ctx = worldCtx({
      _worldExpanded: { w1: true, },
      _worldChats: {},
      loadWorldChats: () => { loads++; },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect((ctx._worldExpanded as Record<string, boolean>)["w1"],).toBe(false,);
    expect(loads,).toBe(0,);
  },);

  test("expanding a cached world does not reload", () => {
    let loads = 0;
    const ctx = worldCtx({
      _worldExpanded: {},
      _worldChats: { w1: [], },
      loadWorldChats: () => { loads++; },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect(loads,).toBe(0,);
  },);
},);

describe("chatWorld.getChatId", () => {
  test("returns the active chat", () => {
    expect(chatWorld.getChatId!.call({ activeChat: "c1", },),).toBe("c1",);
    expect(chatWorld.getChatId!.call({ activeChat: null, },),).toBeNull();
  },);
},);

describe("chatWorld.selectChat guards", () => {
  test("ignores reentrant calls while a selection is in flight", async () => {
    let inner = 0;
    const ctx = worldCtx({ _selectingChat: true, _selectChatInner: async () => { inner++; }, },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(inner,).toBe(0,);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("warns when a generation is running instead of switching", async () => {
    const toasts: { type: string; message: string }[] = [];
    let inner = 0;
    const ctx = worldCtx({
      isGenerating: true,
      _selectChatInner: async () => { inner++; },
      $dispatch: (e: string, d: { type: string; message: string },) => {
        if (e === "show-toast") { toasts.push(d,); }
      },
    },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(inner,).toBe(0,);
    expect(toasts[0]?.type,).toBe("warning",);
  },);

  test("clears the guard after a successful selection", async () => {
    const ctx = worldCtx({ _selectingChat: false, _selectChatInner: async () => {}, },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(ctx._selectingChat,).toBe(false,);
  },);
},);
