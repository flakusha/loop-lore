// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import "./context-window";

type CtxWindowState = {
  currentTokens: number;
  maxTokens: number;
  available: number;
  percentage: number;
  status: string;
  threshold: string;
  loading: boolean;
  chatId: string | null;
  sections: { name: string; tokens: number; pct: number }[];
  suggestions: { section: string; tokens: number; message: string }[];
  statusColor: string;
  statusText: string;
  formattedTokens: string;
  formattedAvailable: string;
  hasSections: boolean;
  sectionColor(name: string,): string;
  sectionGrow(name: string,): number;
  load(chatId: string,): Promise<void>;
  refresh(): Promise<void>;
};

const factory = (globalThis as unknown as { contextWindow?: () => CtxWindowState }).contextWindow!;

function fresh(): CtxWindowState {
  return factory();
}

// ── Mock apiFetch (context-window imports htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
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

describe("contextWindow display getters", () => {
  test("statusColor maps every status", () => {
    const s = fresh();
    s.status = "healthy";
    expect(s.statusColor,).toBe("bg-green-500",);
    s.status = "warning";
    expect(s.statusColor,).toBe("bg-yellow-500",);
    s.status = "critical";
    expect(s.statusColor,).toBe("bg-orange-500",);
    s.status = "imminent";
    expect(s.statusColor,).toBe("bg-red-600",);
    s.status = "bogus" as never;
    expect(s.statusColor,).toBe("bg-green-500",);
  },);

  test("statusText describes every status", () => {
    const s = fresh();
    s.status = "healthy";
    expect(s.statusText,).toBe("Plenty of room",);
    s.status = "warning";
    expect(s.statusText,).toBe("Approaching limit",);
    s.status = "critical";
    expect(s.statusText,).toContain("pruning",);
    s.status = "imminent";
    expect(s.statusText,).toContain("capacity",);
    s.status = "bogus" as never;
    expect(s.statusText,).toBe("",);
  },);

  test("sectionColor maps known sections and defaults to history", () => {
    const s = fresh();
    expect(s.sectionColor("system",),).toBe("ctx-seg-system",);
    expect(s.sectionColor("lore",),).toBe("ctx-seg-lore",);
    expect(s.sectionColor("memories",),).toBe("ctx-seg-memories",);
    expect(s.sectionColor("history",),).toBe("ctx-seg-history",);
    expect(s.sectionColor("unknown-section",),).toBe("ctx-seg-history",);
  },);

  test("sectionGrow returns the budget share with a 0.5 floor", () => {
    const s = fresh();
    s.sections = [{ name: "system", tokens: 100, pct: 25, }, { name: "tiny", tokens: 1, pct: 0.1, },];
    expect(s.sectionGrow("system",),).toBe(25,);
    expect(s.sectionGrow("tiny",),).toBe(0.5,);
    expect(s.sectionGrow("missing",),).toBe(0.5,);
  },);

  test("formatted getters include both counts", () => {
    const s = fresh();
    s.currentTokens = 1000;
    s.maxTokens = 32_000;
    s.available = 31_000;
    expect(s.formattedTokens,).toContain("32",);
    expect(s.formattedTokens,).toContain("1",);
    expect(s.formattedAvailable,).toContain("31",);
    expect(s.hasSections,).toBe(false,);
    s.sections = [{ name: "history", tokens: 5, pct: 1, },];
    expect(s.hasSections,).toBe(true,);
  },);
},);

describe("contextWindow.load", () => {
  test("returns early without a chat id", async () => {
    const s = fresh();
    await s.load("",);
    expect(fetchCalls,).toHaveLength(0,);
    expect(s.loading,).toBe(false,);
  },);

  test("stores the snapshot and clears loading", async () => {
    mockFetch(200, {
      currentTokens: 500,
      maxTokens: 8000,
      available: 7500,
      percentage: 6,
      status: "healthy",
      threshold: "healthy",
      sections: [{ name: "system", tokens: 100, pct: 20, },],
      suggestions: [{ section: "history", tokens: 50, message: "prune", },],
    },);
    const s = fresh();
    await s.load("chat-1",);
    expect(s.chatId,).toBe("chat-1",);
    expect(s.currentTokens,).toBe(500,);
    expect(s.maxTokens,).toBe(8000,);
    expect(s.sections,).toHaveLength(1,);
    expect(s.suggestions,).toHaveLength(1,);
    expect(s.loading,).toBe(false,);
    expect(fetchCalls[0]!.url,).toBe("/api/chats/chat-1/context",);
  },);

  test("falls back between status and threshold", async () => {
    mockFetch(200, { threshold: "warning", },);
    const s = fresh();
    await s.load("c1",);
    expect(s.status,).toBe("warning",);
    expect(s.threshold,).toBe("warning",);
  },);

  test("coerces non-array sections to empty", async () => {
    mockFetch(200, { sections: "bad", suggestions: null, },);
    const s = fresh();
    await s.load("c1",);
    expect(s.sections,).toEqual([],);
    expect(s.suggestions,).toEqual([],);
  },);

  test("keeps last-known state on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const s = fresh();
    s.currentTokens = 42;
    await s.load("c1",);
    expect(s.currentTokens,).toBe(42,);
    expect(s.loading,).toBe(false,);
  },);

  test("ignores non-ok responses", async () => {
    mockFetch(500, {},);
    const s = fresh();
    await s.load("c1",);
    expect(s.currentTokens,).toBe(0,);
    expect(s.loading,).toBe(false,);
  },);
},);

describe("contextWindow.refresh", () => {
  test("skips the network without a chat id", async () => {
    const s = fresh();
    s.chatId = null;
    await s.refresh();
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("reloads the active chat", async () => {
    mockFetch(200, { currentTokens: 7, },);
    const s = fresh();
    s.chatId = "chat-9";
    await s.refresh();
    expect(fetchCalls[0]!.url,).toBe("/api/chats/chat-9/context",);
    expect(s.currentTokens,).toBe(7,);
  },);

  test("refresh does not throw when load is stubbed", async () => {
    const s = fresh();
    s.chatId = "c1";
    s.load = mock(async () => {}) as unknown as CtxWindowState["load"];
    await expect(s.refresh(),).resolves.toBeUndefined();
  },);
},);
