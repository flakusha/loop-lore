// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SCENE_ID_ATTR, viewMode, } from "./view-mode";

/** Minimal stand-in for the #vn-container element. */
class FakeSceneContainer {
  private readonly attrs = new Map<string, string>();

  getAttribute(name: string,): string | null {
    return this.attrs.get(name,) ?? null;
  }

  setAttribute(name: string, value: string,): void {
    this.attrs.set(name, value,);
  }

  removeAttribute(name: string,): void {
    this.attrs.delete(name,);
  }
}

let observers: FakeObserver[] = [];

/** Captures the watcher callback so tests can fire it synchronously. */
class FakeObserver {
  private readonly callback: () => void;

  constructor(callback: () => void,) {
    this.callback = callback;
    observers.push(this,);
  }

  observe(): void {}

  disconnect(): void {}

  fire(): void {
    this.callback();
  }
}

interface Env {
  container: FakeSceneContainer;
  latestObserver(): FakeObserver | undefined;
}

/** Swap in a fake container + MutationObserver for the duration of run(). */
function withWatcherDom(run: (env: Env,) => void,): void {
  const g = globalThis as Omit<typeof globalThis, "MutationObserver"> & {
    MutationObserver?: unknown;
    document: { querySelector: unknown };
  };
  const prevQuery = g.document.querySelector;
  const prevObserver = g.MutationObserver;
  const container = new FakeSceneContainer();
  observers = [];
  g.document.querySelector = () => container;
  g.MutationObserver = FakeObserver;
  try {
    run({
      container,
      latestObserver: () => observers.at(-1,),
    },);
  } finally {
    g.document.querySelector = prevQuery;
    if (prevObserver === undefined) {
      delete g.MutationObserver;
    } else {
      g.MutationObserver = prevObserver;
    }
  }
}

describe("view-mode scene watcher", () => {
  test("initial scene attach preserves the chosen camera (deep link)", () => {
    withWatcherDom(({ container, latestObserver, },) => {
      const state = viewMode();
      state.restore();
      state.set("cinematic",);

      container.setAttribute(SCENE_ID_ATTR, "chat-1",);
      latestObserver()?.fire();

      expect(state.mode,).toBe("cinematic",);
    },);
  });

  test("scene swap resets the camera to orbit and mirrors data-mode", () => {
    withWatcherDom(({ container, latestObserver, },) => {
      const state = viewMode();
      state.restore();

      container.setAttribute(SCENE_ID_ATTR, "chat-1",);
      latestObserver()?.fire();
      state.set("first-person",);
      expect(state.mode,).toBe("first-person",);

      container.setAttribute(SCENE_ID_ATTR, "chat-2",);
      latestObserver()?.fire();

      expect(state.mode,).toBe("orbit",);
      expect(container.getAttribute("data-mode",),).toBe("orbit",);
    },);
  });

  test("teardown resets; re-attaching a scene does not reset again", () => {
    withWatcherDom(({ container, latestObserver, },) => {
      const state = viewMode();
      state.restore();

      container.setAttribute(SCENE_ID_ATTR, "chat-1",);
      latestObserver()?.fire();
      state.set("first-person",);

      container.removeAttribute(SCENE_ID_ATTR,);
      latestObserver()?.fire();
      expect(state.mode,).toBe("orbit",);

      // Re-entering the same chat re-attaches from null — not a swap.
      state.set("first-person",);
      container.setAttribute(SCENE_ID_ATTR, "chat-1",);
      latestObserver()?.fire();
      expect(state.mode,).toBe("first-person",);
    },);
  });

  test("watcher ignores unrelated attribute changes", () => {
    withWatcherDom(({ container, latestObserver, },) => {
      const state = viewMode();
      state.restore();

      container.setAttribute(SCENE_ID_ATTR, "chat-1",);
      latestObserver()?.fire();
      state.set("first-person",);

      container.setAttribute("data-mode", "bogus",);
      latestObserver()?.fire();

      expect(state.mode,).toBe("first-person",);
    },);
  });
});
