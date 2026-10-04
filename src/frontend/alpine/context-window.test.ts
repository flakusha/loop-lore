// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
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
  init(): void;
  destroy(): void;
  checkWarning(): void;
};

const factory = (globalThis as unknown as { contextWindow?: () => CtxWindowState }).contextWindow!;

function fresh(): CtxWindowState {
  return factory();
}

// ── Mock apiFetch (context-window imports htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
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

describeOrSkip("contextWindow display getters", () => {
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
  });

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
  });

  test("sectionColor maps known sections and defaults to history", () => {
    const s = fresh();
    expect(s.sectionColor("system",),).toBe("ctx-seg-system",);
    expect(s.sectionColor("lore",),).toBe("ctx-seg-lore",);
    expect(s.sectionColor("memories",),).toBe("ctx-seg-memories",);
    expect(s.sectionColor("history",),).toBe("ctx-seg-history",);
    expect(s.sectionColor("unknown-section",),).toBe("ctx-seg-history",);
  });

  test("sectionGrow returns the budget share with a 0.5 floor", () => {
    const s = fresh();
    s.sections = [{ name: "system", tokens: 100, pct: 25, }, { name: "tiny", tokens: 1, pct: 0.1, },];
    expect(s.sectionGrow("system",),).toBe(25,);
    expect(s.sectionGrow("tiny",),).toBe(0.5,);
    expect(s.sectionGrow("missing",),).toBe(0.5,);
  });

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
  });
},);

describeOrSkip("contextWindow.load", () => {
  test("returns early without a chat id", async () => {
    const s = fresh();
    await s.load("",);
    expect(fetchCalls,).toHaveLength(0,);
    expect(s.loading,).toBe(false,);
  });

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
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-1/context",);
  });

  test("falls back between status and threshold", async () => {
    mockFetch(200, { threshold: "warning", },);
    const s = fresh();
    await s.load("c1",);
    expect(s.status,).toBe("warning",);
    expect(s.threshold,).toBe("warning",);
  });

  test("coerces non-array sections to empty", async () => {
    mockFetch(200, { sections: "bad", suggestions: null, },);
    const s = fresh();
    await s.load("c1",);
    expect(s.sections,).toEqual([],);
    expect(s.suggestions,).toEqual([],);
  });

  test("keeps last-known state on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const s = fresh();
    s.currentTokens = 42;
    await s.load("c1",);
    expect(s.currentTokens,).toBe(42,);
    expect(s.loading,).toBe(false,);
  });

  test("ignores non-ok responses", async () => {
    mockFetch(500, {},);
    const s = fresh();
    await s.load("c1",);
    expect(s.currentTokens,).toBe(0,);
    expect(s.loading,).toBe(false,);
  });
},);

describeOrSkip("contextWindow.refresh", () => {
  test("skips the network without a chat id", async () => {
    const s = fresh();
    s.chatId = null;
    await s.refresh();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("reloads the active chat", async () => {
    mockFetch(200, { currentTokens: 7, },);
    const s = fresh();
    s.chatId = "chat-9";
    await s.refresh();
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-9/context",);
    expect(s.currentTokens,).toBe(7,);
  });

  test("refresh does not throw when load is stubbed", async () => {
    const s = fresh();
    s.chatId = "c1";
    s.load = mock(async () => {},) as unknown as CtxWindowState["load"];
    await expect(s.refresh(),).resolves.toBeUndefined();
  });
},);

describeOrSkip("contextWindow.load field fallbacks", () => {
  test("derives available from max-current when missing", async () => {
    mockFetch(200, { currentTokens: 500, maxTokens: 8000, },);
    const s = fresh();
    await s.load("c1",);
    expect(s.available,).toBe(7500,);
  });

  test("keeps the previous percentage when missing", async () => {
    mockFetch(200, { currentTokens: 10, },);
    const s = fresh();
    s.percentage = 42;
    await s.load("c1",);
    expect(s.percentage,).toBe(42,);
  });

  test("falls back to status when only status is provided", async () => {
    mockFetch(200, { status: "critical", },);
    const s = fresh();
    await s.load("c1",);
    expect(s.status,).toBe("critical",);
    expect(s.threshold,).toBe("critical",);
  });

  test("defaults both status and threshold to healthy", async () => {
    mockFetch(200, {},);
    const s = fresh();
    await s.load("c1",);
    expect(s.status,).toBe("healthy",);
    expect(s.threshold,).toBe("healthy",);
  });

  test("keeps defaults when fields are missing", async () => {
    mockFetch(200, {},);
    const s = fresh();
    s.currentTokens = 42;
    s.maxTokens = 999;
    await s.load("c1",);
    expect(s.currentTokens,).toBe(42,);
    expect(s.maxTokens,).toBe(999,);
  });
},);

describeOrSkip("contextWindow.init/destroy", () => {
  const listeners: { type: string; handler: (evt: Event,) => void }[] = [];
  const removed: { type: string; handler: (evt: Event,) => void }[] = [];
  let realDocument: unknown;

  beforeEach(() => {
    realDocument = (globalThis as Record<string, unknown>).document;
    (globalThis as Record<string, unknown>).document = {
      addEventListener: (type: string, handler: (evt: Event,) => void,) => {
        listeners.push({ type, handler, },);
      },
      removeEventListener: (type: string, handler: (evt: Event,) => void,) => {
        removed.push({ type, handler, },);
      },
      querySelector: () => null,
    };
  },);

  afterEach(() => {
    (globalThis as Record<string, unknown>).document = realDocument;
    listeners.length = 0;
    removed.length = 0;
  },);

  test("subscribes to chat-context-refresh and reloads on the event", async () => {
    const s = fresh();
    s.init();
    expect(listeners,).toHaveLength(1,);
    expect(listeners[0]!.type,).toBe("chat-context-refresh",);
    mockFetch(200, { currentTokens: 9, },);
    listeners[0]!.handler(new CustomEvent("chat-context-refresh", { detail: { chatId: "c7", }, },),);
    await new Promise<void>((resolve,) => setTimeout(resolve, 10,));
    expect(s.chatId,).toBe("c7",);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/c7/context",);
    expect(s.currentTokens,).toBe(9,);
  });

  test("cold-restores the active chat via Alpine.$data", async () => {
    const el = {};
    (globalThis as Record<string, unknown>).document = {
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => el,
    };

    (globalThis as Record<string, unknown>).Alpine = {
      $data: () => ({ activeChat: "c5", }),
    };

    mockFetch(200, { currentTokens: 3, },);
    const s = fresh();
    s.init();
    await new Promise<void>((resolve,) => setTimeout(resolve, 10,));
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/c5/context",);
    expect(s.chatId,).toBe("c5",);
  });

  test("skips the cold restore without a chat root", () => {
    const s = fresh();
    s.init();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("skips the cold restore when Alpine is undefined", () => {
    const el = {};
    (globalThis as Record<string, unknown>).document = {
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => el,
    };

    delete (globalThis as Record<string, unknown>).Alpine;
    const s = fresh();
    s.init();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("skips the cold restore when there is no active chat", async () => {
    const el = {};
    (globalThis as Record<string, unknown>).document = {
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => el,
    };

    (globalThis as Record<string, unknown>).Alpine = {
      $data: () => ({ activeChat: null, }),
    };

    const s = fresh();
    s.init();
    await new Promise<void>((resolve,) => setTimeout(resolve, 10,));
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("destroy removes the refresh listener", () => {
    const s = fresh();
    s.init();
    s.destroy();
    expect(removed,).toHaveLength(1,);
    expect(removed[0]!.type,).toBe("chat-context-refresh",);
    expect(removed[0]!.handler,).toBe(listeners[0]!.handler,);
  });

  test("destroy no-ops without a handler", () => {
    const s = fresh();
    s.destroy();
    expect(removed,).toHaveLength(0,);
  });
},);

describeOrSkip("contextWindow.checkWarning", () => {
  const dispatched: Event[] = [];
  let realDocument: unknown;

  beforeEach(() => {
    realDocument = (globalThis as Record<string, unknown>).document;
    (globalThis as Record<string, unknown>).document = {
      dispatchEvent: (evt: Event,) => {
        dispatched.push(evt,);
        return true;
      },
    };
  },);

  afterEach(() => {
    (globalThis as Record<string, unknown>).document = realDocument;
    dispatched.length = 0;
  },);

  test("dispatches a warning toast at the warning threshold", () => {
    const s = fresh();
    s.status = "warning";
    s.percentage = 81;
    s.checkWarning();
    expect(dispatched,).toHaveLength(1,);
    const detail = (dispatched[0] as CustomEvent<{ type: string; message: string }>).detail;
    expect(detail.type,).toBe("warning",);
    expect(detail.message,).toContain("81",);
  });

  test("no-ops unless the status is warning", () => {
    const s = fresh();
    s.status = "healthy";
    s.checkWarning();
    expect(dispatched,).toHaveLength(0,);
  });
},);
