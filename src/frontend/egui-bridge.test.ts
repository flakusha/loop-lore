// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for egui-bridge.ts: context round-trip, validation fallbacks
 * (malformed JSON / wrong version / non-string fields), the htmx → egui →
 * htmx navigation contract, and the window/button wiring.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  DEFAULT_EGUI_CONTEXT,
  EGUI_CONTEXT_KEY,
  handoffToEgui,
  initEguiBridge,
  readEguiContext,
  returnToHtmx,
  writeEguiContext,
} from "./egui-bridge";

type StorageSidecar = { backing: Map<string, string> };

const realStorage = (globalThis as { localStorage?: unknown }).localStorage;
const realLocation = (globalThis as { location?: unknown }).location;
const realWindow = (globalThis as { window?: unknown }).window;
const realAddEventListener = document.addEventListener;

let store: Storage & StorageSidecar;
let assigns: string[] = [];
let locPathname = "/views/chat";
let locSearch = "";

/** Map-backed localStorage stub, mirroring alpine/chat-filters.test.ts. */
function withFakeStorage(): void {
  const backing = new Map<string, string>();
  const fake = {
    getItem: (key: string,) => backing.get(key,) ?? null,
    setItem: (key: string, value: string,) => void backing.set(key, value,),
    removeItem: (key: string,) => void backing.delete(key,),
    backing,
  } as unknown as Storage & StorageSidecar;

  (globalThis as { localStorage: unknown }).localStorage = fake;
  store = fake;
}

/** Stub location with a recorded `assign` — mirrors fe-fetch.test.ts. */
function withFakeLocation(): void {
  assigns = [];
  locPathname = "/views/chat";
  locSearch = "";
  (globalThis as { location: unknown }).location = {
    get pathname() {
      return locPathname;
    },
    get search() {
      return locSearch;
    },
    assign: (url: string,) => {
      assigns.push(url,);
    },
  };
}

beforeEach(() => {
  withFakeStorage();
  withFakeLocation();
},);

afterEach(() => {
  (globalThis as { localStorage: unknown }).localStorage = realStorage;
  (globalThis as { location: unknown }).location = realLocation;
  (globalThis as { window: unknown }).window = realWindow;
  document.addEventListener = realAddEventListener;
  delete (globalThis as { loopLoreEgui?: unknown }).loopLoreEgui;
},);

describe("readEguiContext / writeEguiContext", () => {
  test("round-trips a written context", () => {
    const context = { version: 1, activeChatId: "c1", returnTo: "/views/chat?chatid=c1", } as const;
    writeEguiContext(context,);
    expect(readEguiContext(),).toEqual(context,);
  });

  test("round-trips through an injected storage", () => {
    const backing = new Map<string, string>();
    const injected = {
      getItem: (key: string,) => backing.get(key,) ?? null,
      setItem: (key: string, value: string,) => void backing.set(key, value,),
    } as unknown as Storage;

    writeEguiContext({ ...DEFAULT_EGUI_CONTEXT, activeChatId: "c9", }, { storage: injected, },);
    expect(readEguiContext({ storage: injected, },),).toEqual({ ...DEFAULT_EGUI_CONTEXT, activeChatId: "c9", },);
  });

  test("malformed JSON falls back to the defaults", () => {
    store.backing.set(EGUI_CONTEXT_KEY, "{not json",);
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);
  });

  test("wrong version falls back to the defaults", () => {
    store.backing.set(EGUI_CONTEXT_KEY, JSON.stringify({ version: 2, activeChatId: "c1", returnTo: "/views/chat", },),);
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);
  });

  test("non-string fields fall back to the defaults", () => {
    store.backing.set(EGUI_CONTEXT_KEY, JSON.stringify({ version: 1, activeChatId: 7, returnTo: "/views/chat", },),);
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);

    store.backing.set(EGUI_CONTEXT_KEY, JSON.stringify({ version: 1, activeChatId: "c1", returnTo: 42, },),);
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);
  });

  test("a protocol-relative returnTo falls back to the defaults", () => {
    store.backing.set(EGUI_CONTEXT_KEY, JSON.stringify({ version: 1, activeChatId: null, returnTo: "//evil.test", },),);
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);
  });

  test("an empty blob yields the defaults", () => {
    expect(readEguiContext(),).toEqual(DEFAULT_EGUI_CONTEXT,);
  });

  test("survives storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked",);
      },
      setItem: () => {
        throw new Error("blocked",);
      },
    } as unknown as Storage;

    expect(() => readEguiContext({ storage: hostile, },)).not.toThrow();
    expect(readEguiContext({ storage: hostile, },),).toEqual(DEFAULT_EGUI_CONTEXT,);
    expect(() => writeEguiContext(DEFAULT_EGUI_CONTEXT, { storage: hostile, },)).not.toThrow();
  });
});

describe("handoffToEgui", () => {
  test("stores the lowercase chatid, the current URL, and navigates to /egui", () => {
    locPathname = "/views/chat";
    locSearch = "?chatid=ABC-123";

    handoffToEgui();

    expect(readEguiContext(),).toEqual({
      version: 1,
      activeChatId: "abc-123",
      returnTo: "/views/chat?chatid=ABC-123",
    },);

    expect(assigns,).toEqual(["/egui",],);
  });

  test("without a chatid param stores a null activeChatId", () => {
    locPathname = "/views/chat";
    locSearch = "";

    handoffToEgui();

    expect(readEguiContext().activeChatId,).toBeNull();
    expect(readEguiContext().returnTo,).toBe("/views/chat",);
    expect(assigns,).toEqual(["/egui",],);
  });
});

describe("returnToHtmx", () => {
  test("navigates to the stored returnTo and keeps the active chat id", () => {
    writeEguiContext({ version: 1, activeChatId: "c1", returnTo: "/views/chat?chatid=c1", },);

    returnToHtmx();

    expect(assigns,).toEqual(["/views/chat?chatid=c1",],);
    expect(readEguiContext(),).toEqual({ version: 1, activeChatId: "c1", returnTo: "/views/chat?chatid=c1", },);
  });

  test("falls back to /views/chat when nothing is stored", () => {
    returnToHtmx();

    expect(assigns,).toEqual([DEFAULT_EGUI_CONTEXT.returnTo,],);
  });
});

/** Fire a synthetic click whose `target.closest` matches only `match`. */
function clickEvent(handler: ((event: Event,) => void) | undefined, match: string | null,): void {
  handler?.({
    target: { closest: (selector: string,) => (selector === match ? {} : null), },
  } as unknown as Event,);
}

describe("initEguiBridge", () => {
  test("attaches window.loopLoreEgui and wires the entry button click", () => {
    let clickHandler: ((event: Event,) => void) | undefined;
    (globalThis as { window: unknown }).window = globalThis;
    document.addEventListener = ((type: string, listener: (event: Event,) => void,) => {
      if (type === "click") { clickHandler = listener; }
    }) as typeof document.addEventListener;

    initEguiBridge();

    expect(typeof (globalThis as { loopLoreEgui?: { handoffToEgui?: unknown } }).loopLoreEgui?.handoffToEgui,).toBe(
      "function",
    );

    locSearch = "?chatid=C2";
    clickEvent(clickHandler, '[data-testid="open-in-egui"]',);
    expect(assigns,).toEqual(["/egui",],);
    expect(readEguiContext().activeChatId,).toBe("c2",);

    assigns = [];
    clickEvent(clickHandler, null,);
    expect(assigns,).toEqual([],);
  });

  test("is a no-op without a document", () => {
    const realDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = undefined;
    try {
      expect(() => initEguiBridge()).not.toThrow();
      expect((globalThis as { loopLoreEgui?: unknown }).loopLoreEgui,).toBeUndefined();
    } finally {
      (globalThis as { document: unknown }).document = realDoc;
    }
  });
});
