// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import type { LogEntry, Transport, } from "../../logger/types";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { log, } from "./logger";

// ISOLATED-only: mock.module is process-global and poisons later files'
// `./htmx` imports without --isolate (cross-file contamination).
if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: (url: string, opts?: RequestInit,) => (globalThis as any).__apiFetch(url, opts,),
  }),);
}

// eslint-disable-next-line import/first
import "./admin";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showTab?: (tab: string,) => void;
  adminPage?: () => any;
};

const originalFetch = globalState.apiFetch;

let calls: { url: string }[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
  (globalThis as any).__apiFetch = (url: string, opts?: RequestInit,) => {
    calls.push({ url, },);
    return handler(url, opts,);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
},);

function fresh() {
  return globalState.adminPage!();
}

describeOrSkip("adminPage factory", () => {
  test("returns shared state defaults", () => {
    const a = fresh();
    expect(a.activeTab,).toBe("overview",);
    expect(a.tabsLoaded,).toEqual({},);
    expect(a.pageSize,).toBe(20,);
    expect(a.stats.users,).toBe(0,);
    expect(a._overviewPollTimer,).toBeNull();
  });

  test("formatDate handles null and iso", () => {
    const a = fresh();
    expect(a.formatDate(null,),).toBe("-",);
    expect(typeof a.formatDate("2026-01-01T00:00:00Z",),).toBe("string",);
  });

  test("displayKey humanizes keys", () => {
    const a = fresh();
    expect(a.displayKey("foo_bar",),).toBe("Foo Bar",);
  });
},);

describeOrSkip("init / destroy", () => {
  test("init starts overview poll timer", async () => {
    const a = fresh();
    await a.init();
    expect(a._overviewPollTimer,).not.toBeNull();
    a.destroy();
    expect(a._overviewPollTimer,).toBeNull();
  });

  test("destroy is safe when no timer", () => {
    const a = fresh();
    expect(() => a.destroy()).not.toThrow();
  });
},);

describeOrSkip("showTab", () => {
  test("sets activeTab and loads overview once", () => {
    const a = fresh();
    a.showTab("overview",);
    expect(a.activeTab,).toBe("overview",);
    expect(a.tabsLoaded.overview,).toBe(true,);
    const before = calls.length;
    a.showTab("overview",);
    expect(calls.length,).toBe(before,);
  });

  test("goToSection delegates", () => {
    const a = fresh();
    a.goToSection("users",);
    expect(a.activeTab,).toBe("users",);
  });
},);

describeOrSkip("loadOverview", () => {
  test("populates stats and recentEntries on success", async () => {
    handler = async (url,) => {
      if (url.includes("/stats",)) {
        return Response.json({
          users: 5,
          chats: 0,
          messages: 0,
          characters: 0,
          assets: 0,
          worlds: 0,
          deltas: { users: 0, chats: 0, worlds: 0, assets: 0, },
        },);
      }

      return Response.json({
        data: [{
          id: "1",
          level: 1,
          message: "m",
          module: null,
          event_type: null,
          entity_type: null,
          entity_id: null,
          created_at: "x",
        },],
      },);
    };

    const a = fresh();
    await a.loadOverview();
    expect(a.stats.users,).toBe(5,);
    expect(a.recentEntries.length,).toBe(1,);
  });

  test("does not throw on failure", async () => {
    handler = async () => {
      throw new Error("boom",);
    };

    const a = fresh();
    await expect(a.loadOverview(),).resolves.toBeUndefined();
  });
},);

describeOrSkip("global showTab fallback", () => {
  test("routes the warning through the frontend logger", async () => {
    const entries: LogEntry[] = [];
    const transport: Transport = {
      name: "test-capture",
      write: (entry,) => {
        entries.push(entry,);
        return Promise.resolve();
      },
      flush: async () => {},
    };

    log.addTransport(transport,);

    globalState.showTab!("x",);
    // The browser logger batches entries on a 100ms interval.
    await new Promise((resolve,) => setTimeout(resolve, 250,));

    const entry = entries.find((e,) =>
      typeof e.message === "string" && e.message.includes("showTab called outside Alpine scope",)
    );

    expect(entry,).toBeDefined();
    expect(entry?.module,).toBe("admin",);
  });
},);

describeOrSkip("showTab dispatch", () => {
  test("loads every admin tab once", () => {
    const a = fresh();
    // The factory returns a plain object literal, so its loader methods are
    // own enumerable properties we can stub to exercise every tab branch.
    const host = a as Record<string, unknown>;
    const called: string[] = [];
    for (const key of Object.keys(host,)) {
      if (key === "showTab" || key === "destroy") { continue; }
      if (typeof host[key] === "function") {
        host[key] = () => {
          called.push(key,);
        };
      }
    }

    const tabs = [
      "overview",
      "users",
      "worlds",
      "chats",
      "audit",
      "worldEvents",
      "models",
      "review",
      "templates",
      "workflows",
      "plugins",
      "system",
      "analytics",
      "health",
      "harness",
      "federation",
    ];

    for (const tab of tabs) {
      a.showTab(tab,);
    }

    expect(a.tabsLoaded.federation,).toBe(true,);
    expect(called,).toContain("loadClassifierVocab",);
    expect(called,).toContain("loadFederationMatrix",);
  });
},);
