// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: the mobile composer leaked one media-query listener per mount.
 *
 * `MediaQueryList.addEventListener` returns `undefined`, so the old teardown
 * (`unlisten?.()` on the cast result) never removed the `change` listener —
 * every mount left one behind on the shared `matchMedia` list.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { mobileComposer, } from "./mobile-composer";

interface FakeMediaQueryList {
  matches: boolean;
  added: string[];
  removed: string[];
  handlers: Map<string, EventListener>;
  addEventListener(type: string, handler: EventListener,): void;
  removeEventListener(type: string, handler: EventListener,): void;
}

const realMatchMedia = globalThis.matchMedia;
const realLocalStorage = globalThis.localStorage;
const realAlpine = (globalThis as unknown as { Alpine?: unknown }).Alpine;

/** Install a `matchMedia` stub that records its listener bookkeeping. */
function installMatchMedia(): FakeMediaQueryList {
  const handlers = new Map<string, EventListener>();
  const mql: FakeMediaQueryList = {
    matches: false,
    added: [],
    removed: [],
    handlers,
    addEventListener(type, handler,) {
      mql.added.push(type,);
      handlers.set(type, handler,);
    },
    removeEventListener(type, handler,) {
      mql.removed.push(type,);
      if (handlers.get(type,) === handler) { handlers.delete(type,); }
    },
  };

  (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => mql;
  return mql;
}

/** The component reads `$refs` off its own scope; the test has no DOM. */
function mountComposer(): ReturnType<typeof mobileComposer> {
  const composer = mobileComposer();
  const scoped = composer as unknown as { $refs: Record<string, unknown> };
  scoped.$refs = {};
  return composer;
}

/** Minimal localStorage stub — the shared draft store reads and writes it. */
function installLocalStorage(get: (key: string,) => string | null,): Map<string, string> {
  const data = new Map<string, string>();
  const stub = {
    getItem: (key: string,) => get(key,) ?? data.get(key,) ?? null,
    setItem: (key: string, value: string,) => {
      data.set(key, value,);
    },
    removeItem: (key: string,) => {
      data.delete(key,);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };

  (globalThis as unknown as { localStorage: unknown }).localStorage = stub;
  return data;
}

/** Point the component at a parent chatState scope (Alpine's $data lookup). */
function installParentScope(parent: Record<string, unknown>,): void {
  (globalThis as unknown as { Alpine?: unknown }).Alpine = {
    $data: () => parent,
  };
}

afterEach(() => {
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = realMatchMedia;
  (globalThis as unknown as { localStorage: unknown }).localStorage = realLocalStorage;
  (globalThis as unknown as { Alpine?: unknown }).Alpine = realAlpine;
},);

describe("mobileComposer", () => {
  test("destroy detaches the media-query change listener", () => {
    const mql = installMatchMedia();
    const composer = mountComposer();

    composer.init();
    expect(mql.added,).toEqual(["change",],);
    expect(mql.handlers.size,).toBe(1,);

    composer.destroy();
    expect(mql.removed,).toEqual(["change",],);
    expect(mql.handlers.size,).toBe(0,);
  });

  test("destroy without a mount does not throw", () => {
    installMatchMedia();
    const composer = mountComposer();

    expect(() => {
      composer.destroy();
    },).not.toThrow();
  });
});

describe("mobileComposer drafts", () => {
  test("saveMobileDraft writes the shared draft after the debounce", async () => {
    const data = installLocalStorage(() => null);
    const composer = mountComposer();
    const input = { value: "hello draft", } as unknown as HTMLInputElement;
    (composer as unknown as { $refs: Record<string, unknown> }).$refs = { mobileInput: input, };
    installParentScope({ activeChat: "chat-1", },);

    composer.saveMobileDraft();
    await new Promise((resolve,) => setTimeout(resolve, 400,));

    expect([...data.values(),].join(" ",),).toContain("hello draft",);
  });

  test("submitMobile forwards the text to the parent chatState", async () => {
    installLocalStorage(() => "1");
    const composer = mountComposer();
    const input = { value: "  send me  ", } as unknown as HTMLInputElement;
    (composer as unknown as { $refs: Record<string, unknown> }).$refs = { mobileInput: input, };
    let sent = false;
    installParentScope({
      activeChat: "chat-1",
      sendMessage: async () => {
        sent = true;
      },
      $refs: { messageInput: { value: "", }, },
    },);

    await composer.submitMobile();

    expect(sent,).toBe(true,);
    expect(input.value,).toBe("",);
  });
});
