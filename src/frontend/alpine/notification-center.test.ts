// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { NotificationCenterItem, } from "./types";

// notification-center.ts uses the ambient apiFetch global (no htmx import).
// Import the side-effect module AFTER installing the test helper + fetch stub
// so module-level t() calls resolve against the real catalog.
import "./notification-center";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
const g = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  notificationCenter?: () => Record<string, unknown>;
  location?: unknown;
};
const originalFetch = g.apiFetch;
const originalLocation = g.location;

interface CenterState {
  loaded: boolean;
  saving: boolean;
  items: NotificationCenterItem[];
  filter: string;
  prefs: Record<string, boolean>;
  refresh(): Promise<void>;
  visible(): NotificationCenterItem[];
  unreadCount(): number;
  onOpen(item: NotificationCenterItem,): Promise<void>;
  markRead(id: string,): Promise<void>;
  markAllRead(): Promise<void>;
  loadPrefs(): Promise<void>;
  toggleType(key: string,): Promise<void>;
  savePrefs(): Promise<void>;
  iconFor(type: string,): string;
  timeAgo(iso: string | undefined,): string;
}

function fresh(): CenterState {
  return g.notificationCenter!() as unknown as CenterState;
}

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.location = originalLocation;
},);

const item = (overrides: Partial<NotificationCenterItem> = {},): NotificationCenterItem => ({
  id: "n1",
  type: "mention",
  title: "Hi",
  body: "hello",
  link: null,
  read: 0,
  createdAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("notificationCenter pure helpers", () => {
  test("visible filters to unread and unreadCount counts them", () => {
    const s = fresh();
    s.items = [item({ id: "a", read: 0, },), item({ id: "b", read: 1, },), item({ id: "c", read: 0, },),];
    expect(s.unreadCount(),).toBe(2,);
    s.filter = "all";
    expect(s.visible(),).toHaveLength(3,);
    s.filter = "unread";
    expect(s.visible().map((n,) => n.id),).toEqual(["a", "c",],);
  });

  test("visible handles empty lists", () => {
    const s = fresh();
    expect(s.visible(),).toEqual([],);
    expect(s.unreadCount(),).toBe(0,);
  });

  test("iconFor falls back to info for unknown types", () => {
    const s = fresh();
    expect(s.iconFor("mention",),).toBe("@",);
    expect(s.iconFor("blog_comment",),).toBe("✎",);
    expect(s.iconFor("unknown-type",),).toBe("i",);
    expect(s.iconFor("",),).toBe("i",);
  });

  test("timeAgo returns empty for missing or invalid dates", () => {
    const s = fresh();
    expect(s.timeAgo(undefined,),).toBe("",);
    expect(s.timeAgo("",),).toBe("",);
    expect(s.timeAgo("not-a-date",),).toBe("",);
  });

  test("timeAgo formats valid ISO dates", () => {
    const s = fresh();
    const out = s.timeAgo("2024-01-15T14:30:00.000Z",);
    expect(typeof out,).toBe("string",);
    expect(out.length,).toBeGreaterThan(0,);
  });
});

describe("notificationCenter fetch", () => {
  test("refresh stores items and marks loaded", async () => {
    handler = async () => new Response(JSON.stringify({ items: [item(),], },), { status: 200, },);
    const s = fresh();
    await s.refresh();
    expect(s.items,).toHaveLength(1,);
    expect(s.loaded,).toBe(true,);
    expect(calls[0]!.url,).toBe("/api/notifications",);
  });

  test("refresh ignores non-ok responses", async () => {
    handler = async () => new Response("err", { status: 500, },);
    const s = fresh();
    s.items = [item(),];
    await s.refresh();
    expect(s.items,).toHaveLength(1,);
    expect(s.loaded,).toBe(false,);
  });

  test("refresh tolerates malformed JSON", async () => {
    handler = async () => new Response("{{{bad", { status: 200, },);
    const s = fresh();
    await s.refresh();
    expect(s.items,).toEqual([],);
  });

  test("onOpen marks read locally without a link", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    const it = item({ read: 0, link: null, },);
    s.items = [it,];
    await s.onOpen(it,);
    expect(it.read,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/notifications/n1",);
    expect(calls[0]!.opts.method,).toBe("PATCH",);
  });

  test("onOpen follows the link after marking read", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const assigned: string[] = [];
    g.location = {
      assign: (url: string,) => {
        assigned.push(url,);
      },
    };
    const s = fresh();
    const it = item({ read: 0, link: "/views/chat?chatid=x", },);
    await s.onOpen(it,);
    expect(assigned,).toEqual(["/views/chat?chatid=x",],);
  });

  test("onOpen skips the PATCH for already-read items but still follows links", async () => {
    const assigned: string[] = [];
    g.location = {
      assign: (url: string,) => {
        assigned.push(url,);
      },
    };
    const s = fresh();
    await s.onOpen(item({ read: 1, link: "/x", },),);
    expect(calls,).toHaveLength(0,);
    expect(assigned,).toEqual(["/x",],);
  });

  test("markRead PATCHes and flips the local row", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    s.items = [item({ id: "a", read: 0, },),];
    await s.markRead("a",);
    expect(s.items[0]!.read,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/notifications/a",);
  });

  test("markRead ignores unknown ids", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    s.items = [];
    await s.markRead("missing",);
    expect(calls[0]!.url,).toBe("/api/notifications/missing",);
  });

  test("markAllRead flips every row", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    s.items = [item({ id: "a", read: 0, },), item({ id: "b", read: 0, },),];
    await s.markAllRead();
    expect(s.items.every((n,) => n.read === 1),).toBe(true,);
    expect(calls[0]!.url,).toBe("/api/notifications/read-all",);
  });

  test("loadPrefs stores the enabled map", async () => {
    handler = async () => new Response(JSON.stringify({ enabled: { mention: true, }, },), { status: 200, },);
    const s = fresh();
    await s.loadPrefs();
    expect(s.prefs,).toEqual({ mention: true, },);
  });

  test("loadPrefs ignores non-ok responses", async () => {
    handler = async () => new Response("x", { status: 500, },);
    const s = fresh();
    s.prefs = { system: true, };
    await s.loadPrefs();
    expect(s.prefs,).toEqual({ system: true, },);
  });

  test("toggleType flips the flag and persists", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    s.prefs = { mention: true, };
    await s.toggleType("mention",);
    expect(s.prefs.mention,).toBe(false,);
    expect(s.saving,).toBe(false,);
    const put = calls.find((c,) => c.url === "/api/notifications/preferences" && c.opts.method === "PATCH");
    expect(put,).toBeDefined();
    expect(JSON.parse(put!.opts.body as string,),).toEqual({ enabled: { mention: false, }, },);
  });

  test("toggleType handles unicode type keys", async () => {
    handler = async () => Response.json({}, { status: 200, },);
    const s = fresh();
    s.prefs = {};
    await s.toggleType("类型-🔔",);
    expect(s.prefs["类型-🔔"],).toBe(true,);
  });
});
