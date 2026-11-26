// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { chatAnalytics, } from "./analytics";

// ── Mock apiFetch (chat/analytics imports ../htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return Response.json({},); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

const FULL_STATS = {
  totalMessages: 9,
  messageCounts: { user: 4, assistant: 3, system: 2, },
  totalTokens: 1234,
  avgMessageLength: 88,
  activeTimeSpanMs: 60000,
  totalGenerations: 3,
  avgLatencyMs: 750,
  costEstimate: 0.01,
  from: null,
  to: null,
};

const ZERO_STATS = {
  totalMessages: 0,
  messageCounts: { user: 0, assistant: 0, system: 0, },
  totalTokens: 0,
  avgMessageLength: 0,
  activeTimeSpanMs: 0,
  totalGenerations: 0,
  avgLatencyMs: 0,
  costEstimate: 0,
  from: null,
  to: null,
};

describeOrSkip("chatAnalytics.loadChatAnalytics", () => {
  test("maps the route payload into panel state", async () => {
    mockFetch(200, FULL_STATS,);
    const ctx = chatAnalytics();
    await ctx.loadChatAnalytics("chat-1",);

    expect(fetchCalls,).toHaveLength(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/analytics/chats/chat-1",);
    expect(fetchCalls[0]?.opts.headers,).toEqual({ Accept: "application/json", },);
    expect(ctx.chatStats,).toEqual({
      totalMessages: 9,
      userMessages: 4,
      assistantMessages: 3,
      systemMessages: 2,
      totalTokens: 1234,
      avgMessageLength: 88,
      activeTimeSpanMs: 60000,
      totalGenerations: 3,
      avgLatencyMs: 750,
      costEstimate: 0.01,
    },);

    expect(ctx.chatStatsLoading,).toBe(false,);
    expect(ctx.chatStatsError,).toBe("",);
  });

  test("URL-encodes an unusual chat id", async () => {
    mockFetch(200, FULL_STATS,);
    const ctx = chatAnalytics();
    await ctx.loadChatAnalytics("chat/42 ?x",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/analytics/chats/chat%2F42%20%3Fx",);
  });

  test("401 surfaces a sign-in message without stats", async () => {
    mockFetch(401, { message: "Unauthorized", },);
    const ctx = chatAnalytics();
    await ctx.loadChatAnalytics("chat-1",);

    expect(ctx.chatStatsError,).toContain("Sign in",);
    expect(ctx.chatStats.totalMessages,).toBe(0,);
    expect(ctx.chatStatsLoading,).toBe(false,);
  });

  test("404 surfaces an unavailable message", async () => {
    mockFetch(404, { message: "Chat not found", },);
    const ctx = chatAnalytics();
    await ctx.loadChatAnalytics("chat-1",);

    expect(ctx.chatStatsError,).toContain("unavailable",);
    expect(ctx.chatStats.totalMessages,).toBe(0,);
    expect(ctx.chatStatsLoading,).toBe(false,);
  });

  test("zero-row response renders zeros through the panel bindings", async () => {
    mockFetch(200, ZERO_STATS,);
    const ctx = chatAnalytics();
    await ctx.loadChatAnalytics("empty-chat",);

    expect(ctx.chatStatsError,).toBe("",);
    expect(Object.values(ctx.chatStats,),).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0,],);

    const html = await Bun.file(
      new URL("../../../components/chat/character-info-panel.html", import.meta.url,),
    ).text();

    expect(html,).toContain('x-data="chatAnalytics()"',);
    for (
      const field of [
        "totalMessages",
        "userMessages",
        "assistantMessages",
        "systemMessages",
        "totalTokens",
        "avgMessageLength",
        "activeTimeSpanMs",
        "totalGenerations",
        "avgLatencyMs",
        "costEstimate",
      ]
    ) {
      expect(html,).toContain(`x-text="chatStats.${field}"`,);
    }
  });
},);
