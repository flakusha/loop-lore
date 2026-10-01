// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend telemetry — opt-in gating, curated event shipping,
 * and the debounced/deduped page_view tracker.
 *
 * The real root logger writes through an AsyncLogQueue on a 100ms interval,
 * so tests swap in a recording fake via setGlobalLogger (a supported seam)
 * and restore it after each test. telemetry.ts keeps module-level state
 * (_initialized, lastPagePath, pageViewTimer), so each flow imports a fresh
 * module instance via a query-busted dynamic import (module-loading
 * boundary: fresh state per flow).
 */

import { afterEach, beforeEach, describe, expect, it, vi, } from "bun:test";
import type { Logger, } from "../../logger/types";
import { getLogger, setGlobalLogger, } from "./logger";
import { CURATED_EVENTS, } from "./transports/telemetry";

type Listener = (event?: unknown,) => void;

type TelemetryModule = {
  initTelemetry: () => void;
  isTelemetryEnabled: () => boolean;
  trackTelemetry: (event: string, data?: Record<string, unknown>,) => void;
};

type FakeLogger = {
  entries: { level: "info" | "error"; message: string; meta?: Record<string, unknown> }[];
  bindings: Record<string, unknown>;
  throwOn?: "info" | "error";
} & Logger;

function makeFakeLogger(): FakeLogger {
  const entries: FakeLogger["entries"] = [];
  const bindings: Record<string, unknown> = {};
  const fake: FakeLogger = {
    entries,
    bindings,
    trace: () => {},
    debug: () => {},
    info: (message: string | Record<string, unknown>, meta?: Record<string, unknown>,) => {
      if (fake.throwOn === "info") { throw new Error("logger boom",); }
      entries.push({ level: "info", message: String(message,), meta, },);
    },
    warn: () => {},
    error: (message: string | Record<string, unknown>, _error?: Error, meta?: Record<string, unknown>,) => {
      if (fake.throwOn === "error") { throw new Error("logger boom",); }
      entries.push({ level: "error", message: String(message,), meta, },);
    },
    fatal: () => {},
    child: () => fake,
    addTransport: () => {},
    setBindings: (partial: Record<string, unknown>,) => {
      Object.assign(bindings, partial,);
    },
    flush: async () => {},
  };
  return fake;
}

const harness = {
  enabled: false,
  location: { pathname: "/chat", search: "", } as { pathname: string; search: string },
  globalListeners: new Map<string, Listener>(),
  docListeners: new Map<string, Listener>(),
};

const globalObj = globalThis as unknown as {
  addEventListener: (type: string, fn: Listener,) => void;
  __TELEMETRY_FRONTEND_ENABLED?: unknown;
  __USER_ID?: string;
  __SESSION_ID?: string;
  location?: { pathname: string; search: string };
};
const docObj = globalThis.document as unknown as {
  addEventListener: (type: string, fn: Listener,) => void;
};

const originalGlobalAdd = globalObj.addEventListener;
const originalDocAdd = docObj.addEventListener;
const originalLocation = globalObj.location;
const realLogger = getLogger();
let fake: FakeLogger;

async function importTelemetry(tag: string,): Promise<TelemetryModule> {
  // Variable specifier: TS cannot type-check a literal with a query string.
  const spec = `./telemetry.ts?fresh=${tag}`;
  return (await import(spec)) as TelemetryModule;
}

beforeEach(() => {
  fake = makeFakeLogger();
  setGlobalLogger(fake,);
  harness.globalListeners.clear();
  harness.docListeners.clear();
  harness.location = { pathname: "/chat", search: "", };
  harness.enabled = false;
  globalObj.addEventListener = (type: string, fn: Listener,) => {
    harness.globalListeners.set(type, fn,);
  };
  docObj.addEventListener = (type: string, fn: Listener,) => {
    harness.docListeners.set(type, fn,);
  };
  globalObj.location = harness.location;
},);

afterEach(() => {
  setGlobalLogger(realLogger,);
  globalObj.addEventListener = originalGlobalAdd;
  docObj.addEventListener = originalDocAdd;
  globalObj.location = originalLocation;
  vi.useRealTimers();
  delete globalObj.__TELEMETRY_FRONTEND_ENABLED;
  delete globalObj.__USER_ID;
  delete globalObj.__SESSION_ID;
},);

/** Meta of the LAST log entry with the matching message (latest event wins). */
function lastMeta(message: string,): Record<string, unknown> | undefined {
  for (let i = fake.entries.length - 1; i >= 0; i -= 1) {
    const entry = fake.entries[i];
    if (entry?.message === message && entry.meta) { return entry.meta; }
  }
  return undefined;
}

function pageViews(): Record<string, unknown>[] {
  return fake.entries.filter((e,) => e.message === "frontend.page_view").map((e,) => e.meta ?? {});
}

describe("isTelemetryEnabled", () => {
  it('accepts true, "true", and 1', async () => {
    const mod = await importTelemetry("enabled-values",);
    for (const value of [true, "true", 1,]) {
      globalObj.__TELEMETRY_FRONTEND_ENABLED = value;
      expect(mod.isTelemetryEnabled(),).toBe(true,);
    }
  });

  it('rejects false, "false", 0, "1", "yes", 2, null, undefined, and empty', async () => {
    const mod = await importTelemetry("disabled-values",);
    for (const value of [false, "false", 0, "1", "yes", 2, null, undefined, "",]) {
      globalObj.__TELEMETRY_FRONTEND_ENABLED = value;
      expect(mod.isTelemetryEnabled(),).toBe(false,);
    }
  });
});

describe("trackTelemetry", () => {
  it("is a no-op when telemetry is disabled", async () => {
    const mod = await importTelemetry("track-disabled",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = false;
    mod.trackTelemetry("my.event", { a: 1, },);
    expect(fake.entries,).toEqual([],);
  });

  it("ships the event with its data when enabled", async () => {
    const mod = await importTelemetry("track-enabled",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    mod.trackTelemetry("my.event", { a: 1, },);
    expect(fake.entries.some((e,) => e.level === "info" && e.message === "my.event" && e.meta?.a === 1),).toBe(true,);
    expect(CURATED_EVENTS.has("my.event",),).toBe(true,);
  });

  it("defaults data to an empty object when omitted", async () => {
    const mod = await importTelemetry("track-no-data",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    mod.trackTelemetry("bare.event",);
    expect(
      fake.entries.some((e,) =>
        e.message === "bare.event" && e.meta && typeof e.meta === "object" && Object.keys(e.meta,).length === 0
      ),
    ).toBe(true,);
  });

  it("swallows logger failures without throwing", async () => {
    const mod = await importTelemetry("track-throws",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    fake.throwOn = "info";
    expect(() => mod.trackTelemetry("fragile.event",)).not.toThrow();
  });
});

describe("initTelemetry (enabled)", () => {
  it("registers popstate/error/unhandledrejection + htmx:afterSettle listeners", async () => {
    const mod = await importTelemetry("init-listeners",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    expect(harness.globalListeners.has("popstate",),).toBe(true,);
    expect(harness.globalListeners.has("error",),).toBe(true,);
    expect(harness.globalListeners.has("unhandledrejection",),).toBe(true,);
    expect(harness.docListeners.has("htmx:afterSettle",),).toBe(true,);
  });

  it("binds userId/sessionId from the injected globals", async () => {
    const mod = await importTelemetry("init-bindings",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    globalObj.__USER_ID = "user-1";
    globalObj.__SESSION_ID = "sess-1";
    vi.useFakeTimers();
    mod.initTelemetry();
    expect(fake.bindings.userId,).toBe("user-1",);
    expect(fake.bindings.sessionId,).toBe("sess-1",);
  });

  it("binds undefined when the injected globals are absent", async () => {
    const mod = await importTelemetry("init-bindings-empty",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    expect("userId" in fake.bindings,).toBe(true,);
    expect(fake.bindings.userId,).toBeUndefined();
    expect(fake.bindings.sessionId,).toBeUndefined();
  });

  it("emits a debounced page_view for the current path", async () => {
    const mod = await importTelemetry("init-pageview",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    expect(pageViews().length,).toBe(0,);
    vi.advanceTimersByTime(300,);
    const views = pageViews();
    expect(views.length,).toBe(1,);
    expect(views[0]?.path,).toBe("/chat",);
  });

  it("includes the chat id from the query string in page_view meta", async () => {
    const mod = await importTelemetry("init-pageview-chatid",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    harness.location.search = "?chatid=abc-123";
    vi.useFakeTimers();
    mod.initTelemetry();
    vi.advanceTimersByTime(300,);
    const views = pageViews();
    expect(views[0]?.chatId,).toBe("abc-123",);
    expect(views[0]?.path,).toBe("/chat",);
  });

  it("dedupes page_view when the path is unchanged (popstate + htmx:afterSettle)", async () => {
    const mod = await importTelemetry("init-dedup",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    vi.advanceTimersByTime(300,);
    const afterInit = pageViews().length;
    harness.globalListeners.get("popstate",)!();
    harness.docListeners.get("htmx:afterSettle",)!();
    vi.advanceTimersByTime(500,);
    expect(pageViews().length,).toBe(afterInit,);
  });

  it("emits a new page_view after a real path change", async () => {
    const mod = await importTelemetry("init-pathchange",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    vi.advanceTimersByTime(300,);
    harness.location.pathname = "/other";
    harness.globalListeners.get("popstate",)!();
    vi.advanceTimersByTime(300,);
    const views = pageViews();
    expect(views.length,).toBe(2,);
    expect(views[1]?.path,).toBe("/other",);
  });

  it("debounces rapid path changes down to the last path", async () => {
    const mod = await importTelemetry("init-debounce",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    harness.location.pathname = "/a";
    harness.globalListeners.get("popstate",)!();
    vi.advanceTimersByTime(200,);
    harness.location.pathname = "/b";
    harness.globalListeners.get("popstate",)!();
    vi.advanceTimersByTime(300,);
    const views = pageViews();
    expect(views.length,).toBe(1,);
    expect(views[0]?.path,).toBe("/b",);
  });

  it("is idempotent — a second init registers nothing new", async () => {
    const mod = await importTelemetry("init-idempotent",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    const globalCount = harness.globalListeners.size;
    const docCount = harness.docListeners.size;
    mod.initTelemetry();
    expect(harness.globalListeners.size,).toBe(globalCount,);
    expect(harness.docListeners.size,).toBe(docCount,);
  });

  it("logs frontend.error with location info on window error", async () => {
    const mod = await importTelemetry("init-error",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    harness.globalListeners.get("error",)!({ message: "boom", filename: "app.ts", lineno: 12, colno: 34, },);
    const meta = lastMeta("frontend.error",);
    expect(meta?.message,).toBe("boom",);
    expect(meta?.filename,).toBe("app.ts",);
    expect(meta?.lineno,).toBe(12,);
    expect(meta?.colno,).toBe(34,);
  });

  it("includes the chat id in error meta", async () => {
    const mod = await importTelemetry("init-error-chatid",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    harness.location.search = "?chatid=xyz";
    vi.useFakeTimers();
    mod.initTelemetry();
    harness.globalListeners.get("error",)!({ message: "boom", filename: "f.ts", lineno: 1, colno: 1, },);
    const meta = lastMeta("frontend.error",);
    expect(meta?.chatId,).toBe("xyz",);
  });

  it("logs unhandledrejection with the reason message and type", async () => {
    const mod = await importTelemetry("init-rejection",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    harness.globalListeners.get("unhandledrejection",)!({ reason: new Error("nope",), },);
    const meta = lastMeta("frontend.error",);
    expect(meta?.message,).toBe("nope",);
    expect(meta?.type,).toBe("unhandledrejection",);
  });

  it("stringifies non-Error rejection reasons", async () => {
    const mod = await importTelemetry("init-rejection-string",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = true;
    vi.useFakeTimers();
    mod.initTelemetry();
    harness.globalListeners.get("unhandledrejection",)!({ reason: "raw failure", },);
    const meta = lastMeta("frontend.error",);
    expect(meta?.message,).toBe("raw failure",);
  });
});

describe("initTelemetry (disabled)", () => {
  it("registers no listeners and emits nothing when telemetry is off", async () => {
    const mod = await importTelemetry("init-disabled",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = false;
    vi.useFakeTimers();
    mod.initTelemetry();
    expect(harness.globalListeners.size,).toBe(0,);
    expect(harness.docListeners.size,).toBe(0,);
    vi.advanceTimersByTime(1000,);
    expect(fake.entries,).toEqual([],);
  });

  it("stays inert on a second call", async () => {
    const mod = await importTelemetry("init-disabled-twice",);
    globalObj.__TELEMETRY_FRONTEND_ENABLED = false;
    vi.useFakeTimers();
    mod.initTelemetry();
    mod.initTelemetry();
    expect(harness.globalListeners.size,).toBe(0,);
    expect(harness.docListeners.size,).toBe(0,);
  });
});
