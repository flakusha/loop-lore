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

afterEach(() => {
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = realMatchMedia;
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
