// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keydown-listener coverage for shortcuts.ts (lines 139-217).
 *
 * bun has no KeyboardEvent, but the listener is a plain function — capture it
 * by recording document.addEventListener before the module loads, then drive
 * it with fake event objects.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import "./shortcuts";

type FakeEvent = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target: { tagName: string; isContentEditable?: boolean };
  preventDefault: () => void;
};

let keydown: ((e: FakeEvent,) => void) | null = null;
let shortcuts: typeof import("./shortcuts");

const toggleSidebarCalls: number[] = [];
const assignedUrls: string[] = [];
const clickedLinks: string[] = [];
const focused: string[] = [];
const querySelectorResults: Record<string, unknown> = {};
let prevented = false;
let keynavEnabled = true;
const _origWindow = (globalThis as { window?: unknown }).window;
const _origAddEventListener = globalThis.document.addEventListener;
const _origQuerySelector = globalThis.document.querySelector;

beforeAll(async () => {
  // bun has no window global — alias it to globalThis (a real EventTarget).
  (globalThis as { window?: unknown }).window = globalThis;
  // Record the keydown listener that shortcuts.ts registers at import time.
  (globalThis.document as { addEventListener: (type: string, fn: unknown,) => void }).addEventListener = (
    type: string,
    fn: unknown,
  ) => {
    if (type === "keydown") { keydown = fn as (e: FakeEvent,) => void; }
  };
  // Fresh instance so the keydown listener registers with the recorder above.
  // The specifier is computed so TypeScript does not try to resolve the
  // cache-busting query suffix (it cannot); bun resolves it at runtime.
  const busted = "./shortcuts" + "?listener-test";
  shortcuts = await import(busted);
},);
afterAll(() => {
  (globalThis as { window?: unknown }).window = _origWindow;
  (globalThis.document as { addEventListener: unknown }).addEventListener = _origAddEventListener;
  (globalThis.document as { querySelector: unknown }).querySelector = _origQuerySelector;
},);

/**
 * @param type
 */
function captureWindowEvent(type: string,) {
  const received: { detail?: unknown }[] = [];
  const listener = (e: Event,) => {
    received.push({ detail: (e as CustomEvent).detail, },);
  };
  window.addEventListener(type, listener,);
  return {
    received,
    cleanup: () => window.removeEventListener(type, listener,),
  };
}

/**
 * @param e
 */
function fire(e: Partial<FakeEvent> = {},) {
  prevented = false;
  keydown!({
    key: "",
    target: { tagName: "DIV", isContentEditable: false, },
    preventDefault: () => {
      prevented = true;
    },
    ...e,
  } as FakeEvent,);
}

let origToggleSidebar: unknown;
let origLocation: unknown;
let origLocalStorage: unknown;

beforeEach(() => {
  toggleSidebarCalls.length = 0;
  assignedUrls.length = 0;
  clickedLinks.length = 0;
  focused.length = 0;
  prevented = false;
  keynavEnabled = true;
  for (const k of Object.keys(querySelectorResults,)) { delete querySelectorResults[k]; }
  origToggleSidebar = (globalThis as { toggleSidebar?: unknown }).toggleSidebar;
  origLocation = (globalThis as { location?: unknown }).location;
  origLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { toggleSidebar?: unknown }).toggleSidebar = () => {
    toggleSidebarCalls.push(1,);
  };
  (globalThis as { location?: unknown }).location = {
    assign: (url: string,) => {
      assignedUrls.push(url,);
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string,) => (k === "keynav" && keynavEnabled ? "1" : null),
    setItem: () => {},
    removeItem: () => {},
  };
  (globalThis.document as { querySelector: (sel: string,) => unknown }).querySelector = (sel: string,) => {
    if (Object.hasOwn(querySelectorResults, sel,)) { return querySelectorResults[sel]; }
    if (sel === '[href="/views/new-chat"]') {
      return {
        click: () => {
          clickedLinks.push(sel,);
        },
      };
    }
    if (sel === "#message-input, .input-row textarea") {
      return {
        focus: () => {
          focused.push("message",);
        },
      };
    }
    if (sel === '.list-search, [type="search"]') {
      return {
        focus: () => {
          focused.push("search",);
        },
      };
    }
    return null;
  };
},);
afterEach(() => {
  (globalThis as { toggleSidebar?: unknown }).toggleSidebar = origToggleSidebar;
  (globalThis as { location?: unknown }).location = origLocation;
  (globalThis as { localStorage?: unknown }).localStorage = origLocalStorage;
},);

describe("ctrl shortcuts", () => {
  it("Ctrl+B toggles sidebar and prevents default", () => {
    fire({ key: "b", ctrlKey: true, },);
    expect(toggleSidebarCalls.length,).toBe(1,);
    expect(prevented,).toBe(true,);
  });

  it("Ctrl+B still fires while typing in an input", () => {
    fire({ key: "b", ctrlKey: true, target: { tagName: "INPUT", }, },);
    expect(toggleSidebarCalls.length,).toBe(1,);
  });

  it("Ctrl+N clicks the new-chat link when present", () => {
    fire({ key: "n", ctrlKey: true, },);
    expect(clickedLinks.length,).toBe(1,);
    expect(assignedUrls.length,).toBe(0,);
  });

  it("Ctrl+N falls back to location.assign without a link", () => {
    querySelectorResults['[href="/views/new-chat"]'] = null;
    fire({ key: "n", ctrlKey: true, },);
    expect(assignedUrls,).toEqual(["/views/new-chat",],);
  });

  it("Ctrl+L focuses the message input", () => {
    fire({ key: "l", ctrlKey: true, },);
    expect(focused,).toEqual(["message",],);
  });

  it("Ctrl+L without an input does not throw", () => {
    querySelectorResults["#message-input, .input-row textarea"] = null;
    fire({ key: "l", ctrlKey: true, },);
    expect(focused.length,).toBe(0,);
  });

  it("Ctrl+K focuses the search box", () => {
    fire({ key: "k", ctrlKey: true, },);
    expect(focused,).toEqual(["search",],);
  });

  it("Ctrl+K without a search box does not throw", () => {
    querySelectorResults['.list-search, [type="search"]'] = null;
    fire({ key: "k", ctrlKey: true, },);
    expect(focused.length,).toBe(0,);
  });
});

describe("input guard", () => {
  it("single keys are ignored while typing in an input", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", target: { tagName: "INPUT", }, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("single keys are ignored in a contentEditable", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", target: { tagName: "DIV", isContentEditable: true, }, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("single keys are ignored in a textarea", () => {
    const cap = captureWindowEvent("keynav:toggle-help",);
    try {
      fire({ key: "?", target: { tagName: "TEXTAREA", }, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("Ctrl+L is blocked in a textarea (only Ctrl+B bypasses the input guard)", () => {
    fire({ key: "l", ctrlKey: true, target: { tagName: "TEXTAREA", }, },);
    expect(focused.length,).toBe(0,);
  });

  it("Ctrl+B still fires in a textarea", () => {
    fire({ key: "b", ctrlKey: true, target: { tagName: "TEXTAREA", }, },);
    expect(toggleSidebarCalls.length,).toBe(1,);
  });
});

describe("keynav disabled (default)", () => {
  it("g does nothing when the flag is unset", () => {
    keynavEnabled = false;
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "g", },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("? does nothing when the flag is unset", () => {
    keynavEnabled = false;
    const cap = captureWindowEvent("keynav:toggle-help",);
    try {
      fire({ key: "?", },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("j does nothing when the flag is unset", () => {
    keynavEnabled = false;
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });
});

describe("keynav enabled", () => {
  it("? dispatches keynav:toggle-help", () => {
    const cap = captureWindowEvent("keynav:toggle-help",);
    try {
      fire({ key: "?", },);
      expect(cap.received.length,).toBe(1,);
    } finally {
      cap.cleanup();
    }
  });

  it("? is ignored when ctrl is held", () => {
    const cap = captureWindowEvent("keynav:toggle-help",);
    try {
      fire({ key: "?", ctrlKey: true, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("g g dispatches goto-chatlist to handlers and the window event", () => {
    let handlerCalls = 0;
    const unsub = shortcuts.registerKeynavHandler("goto-chatlist", () => {
      handlerCalls += 1;
    },);
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "g", },);
      fire({ key: "g", },);
      expect(handlerCalls,).toBe(1,);
      expect(cap.received,).toEqual([{ detail: { action: "goto-chatlist", }, },],);
    } finally {
      cap.cleanup();
      unsub();
    }
  });

  it("g p dispatches goto-personas", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "g", },);
      fire({ key: "p", },);
      expect(cap.received,).toEqual([{ detail: { action: "goto-personas", }, },],);
    } finally {
      cap.cleanup();
    }
  });

  it("g followed by an unknown key dispatches nothing", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "g", },);
      fire({ key: "z", },);
      expect(cap.received.length,).toBe(0,);
      expect(prevented,).toBe(false,);
    } finally {
      cap.cleanup();
    }
  });

  it("a g after a completed sequence starts a new pending", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "g", },);
      fire({ key: "g", },);
      fire({ key: "g", },);
      fire({ key: "g", },);
      expect(cap.received.length,).toBe(2,);
    } finally {
      cap.cleanup();
    }
  });

  it("[ dispatches prev-chat", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "[", },);
      expect(cap.received,).toEqual([{ detail: { action: "prev-chat", }, },],);
    } finally {
      cap.cleanup();
    }
  });

  it("] dispatches next-chat", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "]", },);
      expect(cap.received,).toEqual([{ detail: { action: "next-chat", }, },],);
    } finally {
      cap.cleanup();
    }
  });

  it("j dispatches scroll-down", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", },);
      expect(cap.received,).toEqual([{ detail: { action: "scroll-down", }, },],);
    } finally {
      cap.cleanup();
    }
  });

  it("k dispatches scroll-up", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "k", },);
      expect(cap.received,).toEqual([{ detail: { action: "scroll-up", }, },],);
    } finally {
      cap.cleanup();
    }
  });

  it("keynav keys are ignored when alt is held", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", altKey: true, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("keynav keys are ignored when meta is held", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "j", metaKey: true, },);
      expect(cap.received.length,).toBe(0,);
    } finally {
      cap.cleanup();
    }
  });

  it("unmapped single keys dispatch nothing", () => {
    const cap = captureWindowEvent("keynav:action",);
    try {
      fire({ key: "x", },);
      expect(cap.received.length,).toBe(0,);
      expect(prevented,).toBe(false,);
    } finally {
      cap.cleanup();
    }
  });
});
