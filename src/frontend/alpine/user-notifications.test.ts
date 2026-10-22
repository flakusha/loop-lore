// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import "./user-notifications";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

type NotifItem = { id: string; type: string; title: string; body: string | null; link: string | null; read: number };

type Bell = {
  open: boolean;
  unreadCount: number;
  items: NotifItem[];
  refresh(): Promise<void>;
  connect(): void;
  toggle(): void;
  iconFor(type: string,): string;
  markRead(id: string,): Promise<void>;
  markAllRead(): Promise<void>;
  dismiss(id: string,): Promise<void>;
  goTo(link: string | null,): void;
};

type Prefs = {
  loaded: boolean;
  saving: boolean;
  enabled: Record<string, boolean>;
  mutedWorlds: string[];
  types: { key: string; label: string }[];
  refresh(): Promise<void>;
  toggleType(key: string,): Promise<void>;
  toggleMuteWorld(worldId: string,): Promise<void>;
  save(): Promise<void>;
};

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (t: string, m: string,) => void;
  EventSource?: unknown;
  location?: { assign: (u: string,) => void };
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const originalEventSource = globalState.EventSource;
const originalLocation = globalState.location;

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, ((ev: { data: string },) => void)[]>();
  constructor(url: string,) {
    this.url = url;
    FakeEventSource.instances.push(this,);
  }
  addEventListener(type: string, cb: (ev: { data: string },) => void,) {
    const list = this.listeners.get(type,) ?? [];
    list.push(cb,);
    this.listeners.set(type, list,);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string,) {
    for (const cb of this.listeners.get(type,) ?? []) { cb({ data, },); }
  }
}

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  FakeEventSource.instances = [];
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };

  globalState.EventSource = FakeEventSource as unknown as typeof EventSource;
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  globalState.EventSource = originalEventSource;
  globalState.location = originalLocation;
},);

const bellFactory = () => (globalThis as unknown as { notificationsBell: () => Bell }).notificationsBell();
const prefsFactory = () => (globalThis as unknown as { notificationPrefs: () => Prefs }).notificationPrefs();

describe("notificationsBell refresh", () => {
  test("loads items and computes unreadCount", async () => {
    handler = async () =>
      Response.json({
        items: [
          { id: "1", type: "system", title: "a", body: null, link: null, read: 0, },
          { id: "2", type: "system", title: "b", body: null, link: null, read: 1, },
        ],
      },);

    const bell = bellFactory();
    await bell.refresh();
    expect(bell.items.length,).toBe(2,);
    expect(bell.unreadCount,).toBe(1,);
  });

  test("non-ok response leaves state", async () => {
    handler = async () => new Response(null, { status: 500, },);
    const bell = bellFactory();
    bell.items = [{ id: "x", type: "system", title: "x", body: null, link: null, read: 0, },];
    bell.unreadCount = 1;
    await bell.refresh();
    expect(bell.items.length,).toBe(1,);
    expect(bell.unreadCount,).toBe(1,);
  });
});

describe("notificationsBell connect", () => {
  let sseBell: Bell;
  let source: FakeEventSource;

  test("opens EventSource at notifications stream endpoint", () => {
    sseBell = bellFactory();
    sseBell.connect();
    expect(FakeEventSource.instances.length,).toBe(1,);
    source = FakeEventSource.instances[0] as FakeEventSource;
    expect(source.url,).toBe("/api/v1/notifications/stream",);
  });

  test("connect is guarded by bellStream singleton", () => {
    const bell2 = bellFactory();
    bell2.connect();
    expect(FakeEventSource.instances.length,).toBe(0,);
  });

  test("SSE notifications event updates items and unreadCount", () => {
    const src = (FakeEventSource.instances[0] ?? source) as FakeEventSource;
    sseBell.items = [{ id: "old", type: "system", title: "old", body: null, link: null, read: 0, },];
    src.emit(
      "notifications",
      JSON.stringify({
        unreadCount: 2,
        items: [
          { id: "old", type: "system", title: "old", body: null, link: null, read: 0, },
          { id: "new", type: "system", title: "newtitle", body: null, link: null, read: 0, },
        ],
      },),
    );

    expect(sseBell.items.length,).toBe(2,);
    expect(sseBell.unreadCount,).toBe(2,);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.message,).toBe("newtitle",);
  });

  test("SSE event with zero items and zero unread is ignored", () => {
    const src = (FakeEventSource.instances[0] ?? source) as FakeEventSource;
    const before = sseBell.items.length;
    src.emit("notifications", JSON.stringify({ unreadCount: 0, items: [], },),);
    expect(sseBell.items.length,).toBe(before,);
  });
});

describe("notificationsBell markRead/markAllRead/dismiss", () => {
  test("markRead patches and updates item + count", async () => {
    handler = async () => Response.json({},);
    const bell = bellFactory();
    bell.items = [
      { id: "1", type: "system", title: "a", body: null, link: null, read: 0, },
      { id: "2", type: "system", title: "b", body: null, link: null, read: 0, },
    ];

    bell.unreadCount = 2;
    await bell.markRead("1",);
    expect(calls[0]!.url,).toBe("/api/v1/notifications/1",);
    expect(bell.items[0]!.read,).toBe(1,);
    expect(bell.unreadCount,).toBe(1,);
  });

  test("markAllRead clears unread", async () => {
    handler = async () => Response.json({},);
    const bell = bellFactory();
    bell.items = [{ id: "1", type: "system", title: "a", body: null, link: null, read: 0, },];
    bell.unreadCount = 1;
    await bell.markAllRead();
    expect(calls[0]!.url,).toBe("/api/v1/notifications/read-all",);
    expect(bell.unreadCount,).toBe(0,);
    expect(bell.items[0]!.read,).toBe(1,);
  });

  test("dismiss removes item and recomputes count", async () => {
    handler = async () => Response.json({},);
    const bell = bellFactory();
    bell.items = [
      { id: "1", type: "system", title: "a", body: null, link: null, read: 0, },
      { id: "2", type: "system", title: "b", body: null, link: null, read: 1, },
    ];

    bell.unreadCount = 1;
    await bell.dismiss("1",);
    expect(bell.items.length,).toBe(1,);
    expect(bell.items[0]!.id,).toBe("2",);
    expect(bell.unreadCount,).toBe(0,);
  });
});

describe("notificationsBell helpers", () => {
  test("iconFor returns known icon or default", () => {
    const bell = bellFactory();
    expect(bell.iconFor("mention",),).toBe("@",);
    expect(bell.iconFor("nope",),).toBe("i",);
  });

  test("toggle flips open and refreshes when opened", async () => {
    handler = async () => Response.json({ items: [], },);
    const bell = bellFactory();
    bell.open = false;
    bell.toggle();
    expect(bell.open,).toBe(true,);
    expect(calls.length,).toBeGreaterThan(0,);
  });

  test("goTo assigns location and closes", () => {
    const assignCalls: string[] = [];
    globalState.location = {
      assign: (u: string,) => {
        assignCalls.push(u,);
      },
    };

    const bell = bellFactory();
    bell.open = true;
    bell.goTo("/x",);
    expect(assignCalls,).toEqual(["/x",],);
    expect(bell.open,).toBe(false,);
  });
});

describe("notificationPrefs", () => {
  test("types derived from TYPE_LABELS", () => {
    const prefs = prefsFactory();
    expect(Array.isArray(prefs.types,),).toBe(true,);
    expect(prefs.types.length,).toBeGreaterThan(0,);
    expect(prefs.loaded,).toBe(false,);
  });

  test("refresh loads enabled and mutedWorlds", async () => {
    handler = async () => Response.json({ enabled: { mention: true, }, mutedWorlds: ["w1",], },);
    const prefs = prefsFactory();
    await prefs.refresh();
    expect(prefs.enabled,).toEqual({ mention: true, },);
    expect(prefs.mutedWorlds,).toEqual(["w1",],);
    expect(prefs.loaded,).toBe(true,);
  });

  test("refresh non-ok leaves state", async () => {
    handler = async () => new Response(null, { status: 404, },);
    const prefs = prefsFactory();
    prefs.loaded = true;
    await prefs.refresh();
    expect(prefs.loaded,).toBe(true,);
  });

  test("toggleType flips and saves", async () => {
    handler = async () => Response.json({},);
    const prefs = prefsFactory();
    prefs.enabled = {};
    await prefs.toggleType("mention",);
    expect(prefs.enabled.mention,).toBe(true,);
    expect(calls.some((c,) => c.url === "/api/v1/notifications/preferences" && c.opts?.method === "PATCH"),).toBe(
      true,
    );
  });

  test("toggleMuteWorld adds then removes", async () => {
    handler = async () => Response.json({},);
    const prefs = prefsFactory();
    prefs.mutedWorlds = [];
    await prefs.toggleMuteWorld("w1",);
    expect(prefs.mutedWorlds,).toContain("w1",);
    await prefs.toggleMuteWorld("w1",);
    expect(prefs.mutedWorlds,).not.toContain("w1",);
  });

  test("save sets saving false after", async () => {
    handler = async () => Response.json({},);
    const prefs = prefsFactory();
    await prefs.save();
    expect(prefs.saving,).toBe(false,);
  });
});
