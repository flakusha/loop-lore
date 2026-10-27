// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { NotificationsManager, } from "./notifications";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  constructor(url: string,) {
    this.url = url;
    FakeEventSource.instances.push(this,);
  }
  listeners = new Map<string, (ev: { data?: string },) => void>();
  addEventListener(type: string, handler: (ev: { data?: string },) => void,) {
    this.listeners.set(type, handler,);
  }
  close() {
    this.closed = true;
  }
}

const globalState = globalThis as unknown as Record<string, unknown>;
const originalEventSource = globalState.EventSource;
const originalApiFetch = globalState.apiFetch;
const originalShowToast = globalState.showToast;
const originalDocument = globalState.document;
const originalCss = globalState.CSS;
// Save the pre-file window state: assigning a window here must not leak into
// later files in a shared-process serial run (a location-less window breaks
// any code that evaluates window.location).
const hadWindow = "window" in globalThis;
const originalWindow = (globalThis as { window?: unknown }).window;
let installedWindow = false;

beforeEach(() => {
  // Falsy check, not key presence: earlier files can leave a `window` KEY
  // whose value is undefined, and the suite needs a real window object.
  installedWindow = !(globalThis as { window?: unknown }).window;
  if (installedWindow) { (globalThis as { window?: unknown }).window = globalThis; }
  FakeEventSource.instances = [];
  globalState.EventSource = FakeEventSource;
  globalState.apiFetch = async () => Response.json({ chats: {}, },);
  globalState.showToast = () => {};
},);

afterEach(() => {
  globalState.EventSource = originalEventSource;
  globalState.apiFetch = originalApiFetch;
  globalState.showToast = originalShowToast;
  globalState.document = originalDocument;
  globalState.CSS = originalCss;
  if (installedWindow) {
    if (hadWindow) {
      (globalThis as { window?: unknown }).window = originalWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }

    installedWindow = false;
  }
},);

describe("NotificationsManager start/stop", () => {
  test("start is idempotent (single stream)", () => {
    const m = new NotificationsManager();
    m.start();
    const n1 = FakeEventSource.instances.length;
    m.start();
    expect(FakeEventSource.instances.length,).toBe(n1,);
    m.stop();
  });

  test("start opens SSE stream at activity endpoint", () => {
    const m = new NotificationsManager();
    m.start();
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(FakeEventSource.instances[0]!.url,).toBe("/api/v1/activity/stream",);
    m.stop();
  });

  test("stop closes stream; restart opens new one", () => {
    const m = new NotificationsManager();
    m.start();
    const es = FakeEventSource.instances[0]!;
    m.stop();
    expect(es.closed,).toBe(true,);
    m.start();
    expect(FakeEventSource.instances.length,).toBe(2,);
    m.stop();
  });
});

interface FakeBadge {
  className: string;
  textContent: string;
  remove: () => void;
}

interface FakeHost {
  badges: FakeBadge[];
  classList: {
    add: (name: string,) => void;
    remove: (name: string,) => void;
    contains: (name: string,) => boolean;
  };
  querySelector: (selector: string,) => FakeBadge | null;
  append: (badge: FakeBadge,) => void;
}

/** Minimal DOM fake for the badge renderer (no happy-dom in bun test). */
function installBadgeDom(chatId: string,): FakeHost {
  const badges: FakeBadge[] = [];
  const classes = new Set<string>();
  const host: FakeHost = {
    badges,
    classList: {
      add: (name,) => {
        classes.add(name,);
      },
      remove: (name,) => {
        classes.delete(name,);
      },
      contains: (name,) => classes.has(name,),
    },
    querySelector: (selector,) => (selector === ".badge" ? badges[0] ?? null : null),
    append: (badge,) => {
      badges.push(badge,);
    },
  };

  globalState.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: (selector: string,) => (selector.includes(chatId,) ? host : null),
    createElement: () => {
      const badge: FakeBadge = {
        className: "",
        textContent: "",
        remove: () => {
          const index = badges.indexOf(badge,);
          if (index >= 0) { badges.splice(index, 1,); }
        },
      };

      return badge;
    },
  };

  globalState.CSS = { escape: (value: string,) => value, };
  return host;
}

describe("NotificationsManager unseen state", () => {
  test("markRead clears the unseen count even when the request fails", async () => {
    installBadgeDom("chat-1",);
    globalState.apiFetch = async () => {
      throw new Error("offline",);
    };

    const m = new NotificationsManager();

    await m.markRead("chat-1",);

    expect(m.getUnseenCount("chat-1",),).toBe(0,);
    expect(m.getAllUnseen(),).toEqual({ "chat-1": 0, },);
  });

  test("clearUnseen zeroes the count without a request", () => {
    installBadgeDom("chat-2",);
    const m = new NotificationsManager();

    m.setActiveChat("chat-2",);
    m.clearUnseen("chat-2",);

    expect(m.getUnseenCount("chat-2",),).toBe(0,);
    expect(m.getUnseenCount("unknown",),).toBe(0,);
    expect(m.getAllUnseen(),).toEqual({ "chat-2": 0, },);
  });
});

describe("NotificationsManager activity snapshot", () => {
  test("an activity event updates the unseen count and raises a toast", () => {
    installBadgeDom("chat-3",);
    const m = new NotificationsManager();
    m.start();
    const activity = FakeEventSource.instances[0]!.listeners.get("activity",);
    const toasts: string[] = [];
    globalState.showToast = (_kind: string, message: string,) => {
      toasts.push(message,);
    };

    activity?.({
      data: JSON.stringify({
        chats: {
          "chat-3": { unseenCount: 2, lastMessageCreatedAt: null, chatName: "Third", },
        },
      },),
    },);

    expect(m.getUnseenCount("chat-3",),).toBe(2,);
    expect(toasts,).toEqual(["New message in Third",],);
    m.stop();
  });

  test("the badge reflects the unseen count and is removed again", () => {
    const host = installBadgeDom("chat-4",);
    const m = new NotificationsManager();
    m.start();
    const activity = FakeEventSource.instances[0]!.listeners.get("activity",);

    activity?.({
      data: JSON.stringify({
        chats: {
          "chat-4": { unseenCount: 3, lastMessageCreatedAt: null, chatName: "Fourth", },
        },
      },),
    },);

    expect(host.badges[0]?.textContent,).toBe("3",);
    expect(host.classList.contains("has-unread",),).toBe(true,);

    activity?.({
      data: JSON.stringify({
        chats: {
          "chat-4": { unseenCount: 0, lastMessageCreatedAt: null, chatName: "Fourth", },
        },
      },),
    },);

    expect(host.badges.length,).toBe(0,);
    expect(host.classList.contains("has-unread",),).toBe(false,);
    m.stop();
  });
});
