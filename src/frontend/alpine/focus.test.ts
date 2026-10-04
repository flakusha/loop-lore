/**
 * Focus management tests
 *
 * Note: DOM-dependent tests are skipped in Bun's non-DOM environment.
 * Run these in a browser or with jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import {
  ensureVisibleFocus,
  focusById,
  focusFirst,
  focusIntoView,
  focusMainContent,
  FocusPortal,
  focusSkipToContent,
  getFirstFocusable,
  getLastFocusable,
  handleEscapeKey,
  isInViewport,
  onEscapeKey,
  trapFocus,
} from "./focus";

describe("focus.ts exports", () => {
  it("exports getFirstFocusable as function", () => {
    expect(typeof getFirstFocusable,).toBe("function",);
  });

  it("exports getLastFocusable as function", () => {
    expect(typeof getLastFocusable,).toBe("function",);
  });

  it("exports trapFocus as function", () => {
    expect(typeof trapFocus,).toBe("function",);
  });

  it("exports focusFirst as function", () => {
    expect(typeof focusFirst,).toBe("function",);
  });

  it("exports isInViewport as function", () => {
    expect(typeof isInViewport,).toBe("function",);
  });
});

// DOM-dependent tests - only run in browser environment
if (typeof document !== "undefined" && typeof window !== "undefined") {
  describe("getFirstFocusable DOM tests", () => {
    it("returns first focusable element", () => {
      const container = document.createElement("div",);
      container.innerHTML = `
        <button id="btn1">First</button>
        <button id="btn2">Second</button>
      `;

      document.body.append(container,);

      const result = getFirstFocusable(container,);
      expect(result?.id,).toBe("btn1",);

      container.remove();
    });
  });

  describe("getLastFocusable DOM tests", () => {
    it("returns last focusable element", () => {
      const container = document.createElement("div",);
      container.innerHTML = `
        <button id="btn1">First</button>
        <button id="btn2">Last</button>
      `;

      document.body.append(container,);

      const result = getLastFocusable(container,);
      expect(result?.id,).toBe("btn2",);

      container.remove();
    });
  });

  describe("trapFocus DOM tests", () => {
    it("returns cleanup function", () => {
      const container = document.createElement("div",);
      container.innerHTML = '<button id="btn">Click</button>';
      document.body.append(container,);

      const cleanup = trapFocus(container,);
      expect(typeof cleanup,).toBe("function",);

      cleanup();
      container.remove();
    });
  });
}

// ── Fake DOM for logic tests ─────────────────────────────────────
// The preload installs a document stub but no window, so the browser-only
// block above is skipped in Bun. These tests exercise the pure logic of
// focus.ts against a hand-rolled fake DOM instead.

class FakeClassList {
  private readonly classes = new Set<string>();
  add(...names: string[]): void {
    for (const name of names) { this.classes.add(name,); }
  }
  remove(...names: string[]): void {
    for (const name of names) { this.classes.delete(name,); }
  }
  contains(name: string,): boolean {
    return this.classes.has(name,);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly listeners = new Map<string, Set<(e: unknown,) => void>>();
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly scrollIntoViewCalls: unknown[] = [];
  focusables: FakeElement[] = [];
  focused = false;
  rect = { top: 0, left: 0, bottom: 100, right: 100, };
  constructor(readonly tag: string,) {}
  addEventListener(type: string, fn: (e: unknown,) => void,): void {
    let set = this.listeners.get(type,);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set,);
    }

    set.add(fn,);
  }
  removeEventListener(type: string, fn: (e: unknown,) => void,): void {
    this.listeners.get(type,)?.delete(fn,);
  }
  contains(other: FakeElement,): boolean {
    return this.children.includes(other,);
  }
  focus(): void {
    this.focused = true;
    fakeDocument.activeElement = this;
  }
  setAttribute(name: string, value: string,): void {
    this.attrs[name] = value;
  }
  getBoundingClientRect(): { top: number; left: number; bottom: number; right: number } {
    return this.rect;
  }
  scrollIntoView(opts: unknown,): void {
    this.scrollIntoViewCalls.push(opts,);
  }
  querySelectorAll(): FakeElement[] {
    return this.focusables;
  }
  fire(type: string, event: Record<string, unknown>,): void {
    for (const fn of this.listeners.get(type,) ?? []) {
      fn(event,);
    }
  }
}

const selectorRegistry = new Map<string, unknown>();

const fakeDocument = {
  activeElement: null as FakeElement | null,
  documentElement: { clientHeight: 800, clientWidth: 600, },
  querySelector(selector: string,): FakeElement | null {
    return (selectorRegistry.get(selector,) as FakeElement | undefined) ?? null;
  },
  addEventListener: (_type: string, _fn: (e: unknown,) => void,) => {},
};

const scrollByCalls: { x: number; y: number }[] = [];

const fakeWindow = {
  innerHeight: 800,
  innerWidth: 600,
  scrollBy(x: number, y: number,): void {
    scrollByCalls.push({ x, y, },);
  },
};

const realDocument = globalThis.document;
const realWindow = (globalThis as { window?: unknown }).window;
let closeSidebarCalls = 0;
let escapeUnregister: (() => void) | null = null;

function containerWith(elements: FakeElement[],): FakeElement & Element {
  const container = new FakeElement("div",);
  container.focusables = elements;
  for (const el of elements) {
    container.children.push(el,);
  }

  return container as FakeElement & Element;
}

function keydown(container: FakeElement, target: FakeElement, shiftKey: boolean,): { prevented: boolean } {
  let prevented = false;
  // Real DOM events bubble: the listener sits on the container, the
  // event's target is the focused element.
  container.fire("keydown", {
    key: "Tab",
    shiftKey,
    target,
    preventDefault: () => {
      prevented = true;
    },
  },);

  return { prevented, };
}

describe("focus.ts logic (fake DOM)", () => {
  beforeEach(() => {
    selectorRegistry.clear();
    fakeDocument.activeElement = null;
    closeSidebarCalls = 0;
    scrollByCalls.length = 0;
    globalThis.document = fakeDocument as unknown as Document;
    (globalThis as { window?: unknown }).window = fakeWindow;
    (globalThis as { closeSidebar?: unknown }).closeSidebar = () => {
      closeSidebarCalls += 1;
    };
  },);

  afterEach(() => {
    escapeUnregister?.();
    escapeUnregister = null;
    globalThis.document = realDocument;
    (globalThis as { window?: unknown }).window = realWindow;
    delete (globalThis as { closeSidebar?: unknown }).closeSidebar;
  },);

  describe("getFirstFocusable", () => {
    it("returns the first of many focusables", () => {
      const a = new FakeElement("button",);
      const b = new FakeElement("input",);
      const c = new FakeElement("a",);
      expect(getFirstFocusable(containerWith([a, b, c,],),) as unknown as FakeElement,).toBe(a,);
    });

    it("returns null when no focusables exist", () => {
      expect(getFirstFocusable(containerWith([],),),).toBeNull();
    });

    it("returns the only element when exactly one exists", () => {
      const only = new FakeElement("button",);
      expect(getFirstFocusable(containerWith([only,],),) as unknown as FakeElement,).toBe(only,);
    });
  });

  describe("getLastFocusable", () => {
    it("returns the last of many focusables", () => {
      const a = new FakeElement("button",);
      const b = new FakeElement("input",);
      const c = new FakeElement("a",);
      expect(getLastFocusable(containerWith([a, b, c,],),) as unknown as FakeElement,).toBe(c,);
    });

    it("returns null when no focusables exist", () => {
      expect(getLastFocusable(containerWith([],),),).toBeNull();
    });

    it("returns the only element when exactly one exists", () => {
      const only = new FakeElement("button",);
      expect(getLastFocusable(containerWith([only,],),) as unknown as FakeElement,).toBe(only,);
    });
  });

  describe("trapFocus", () => {
    it("returns a no-op cleanup when the container has no focusables", () => {
      const container = containerWith([],);
      const cleanup = trapFocus(container,);
      expect(typeof cleanup,).toBe("function",);
      expect(() => cleanup()).not.toThrow();
      expect(container.listeners.has("keydown",),).toBe(false,);
    });

    it("wraps forward: Tab on the last element focuses the first", () => {
      const first = new FakeElement("button",);
      const middle = new FakeElement("input",);
      const last = new FakeElement("a",);
      const container = containerWith([first, middle, last,],);
      trapFocus(container,);
      const { prevented, } = keydown(container, last, false,);
      expect(first.focused,).toBe(true,);
      expect(prevented,).toBe(true,);
    });

    it("wraps backward: Shift+Tab on the first element focuses the last", () => {
      const first = new FakeElement("button",);
      const middle = new FakeElement("input",);
      const last = new FakeElement("a",);
      const container = containerWith([first, middle, last,],);
      trapFocus(container,);
      const { prevented, } = keydown(container, first, true,);
      expect(last.focused,).toBe(true,);
      expect(prevented,).toBe(true,);
    });

    it("ignores Tab on a middle element", () => {
      const first = new FakeElement("button",);
      const middle = new FakeElement("input",);
      const last = new FakeElement("a",);
      const container = containerWith([first, middle, last,],);
      trapFocus(container,);
      const { prevented, } = keydown(container, middle, false,);
      expect(first.focused,).toBe(false,);
      expect(last.focused,).toBe(false,);
      expect(prevented,).toBe(false,);
    });

    it("ignores non-Tab keys", () => {
      const first = new FakeElement("button",);
      const last = new FakeElement("a",);
      const container = containerWith([first, last,],);
      trapFocus(container,);
      let prevented = false;
      container.fire("keydown", {
        key: "Enter",
        shiftKey: false,
        target: last,
        preventDefault: () => {
          prevented = true;
        },
      },);

      expect(first.focused,).toBe(false,);
      expect(prevented,).toBe(false,);
    });

    it("ignores Tab when the target is outside the container", () => {
      const first = new FakeElement("button",);
      const last = new FakeElement("a",);
      const container = containerWith([first, last,],);
      trapFocus(container,);
      const outside = new FakeElement("button",);
      const { prevented, } = keydown(container, outside, false,);
      expect(first.focused,).toBe(false,);
      expect(prevented,).toBe(false,);
    });

    it("cleanup removes the keydown listener", () => {
      const first = new FakeElement("button",);
      const last = new FakeElement("a",);
      const container = containerWith([first, last,],);
      const cleanup = trapFocus(container,);
      cleanup();
      // The listener set is emptied (the map key itself remains).
      expect(container.listeners.get("keydown",)?.size ?? 0,).toBe(0,);
      keydown(container, last, false,);
      expect(first.focused,).toBe(false,);
    });
  });

  describe("focusFirst", () => {
    it("focuses the matching element", () => {
      const el = new FakeElement("input",);
      selectorRegistry.set("#msg-input", el,);
      focusFirst("#msg-input",);
      expect(el.focused,).toBe(true,);
    });

    it("does nothing when no element matches", () => {
      expect(() => focusFirst("#missing",)).not.toThrow();
    });

    it("does nothing when the element has no focus method", () => {
      selectorRegistry.set("#plain", {} as unknown as HTMLElement,);
      expect(() => focusFirst("#plain",)).not.toThrow();
    });
  });

  describe("focusSkipToContent", () => {
    it("focuses the skip link when present", () => {
      const link = new FakeElement("a",);
      selectorRegistry.set(".skip-to-content", link,);
      focusSkipToContent();
      expect(link.focused,).toBe(true,);
    });

    it("does nothing when the skip link is absent", () => {
      expect(() => focusSkipToContent()).not.toThrow();
    });
  });

  describe("focusMainContent", () => {
    it("sets tabindex and focuses the main element", () => {
      const main = new FakeElement("main",);
      selectorRegistry.set('[role="main"], #app-root', main,);
      focusMainContent();
      expect(main.attrs["tabindex"],).toBe("-1",);
      expect(main.focused,).toBe(true,);
    });

    it("does nothing when no main element exists", () => {
      expect(() => focusMainContent()).not.toThrow();
    });
  });

  describe("focusById", () => {
    it("focuses the element with the given id", () => {
      const el = new FakeElement("div",);
      selectorRegistry.set("#composer", el,);
      focusById("composer",);
      expect(el.focused,).toBe(true,);
    });

    it("does nothing when no element has the id", () => {
      expect(() => focusById("missing",)).not.toThrow();
    });
  });

  describe("ensureVisibleFocus", () => {
    it("swaps focus-hidden for focus-visible", () => {
      const el = new FakeElement("div",);
      el.classList.add("focus-hidden",);
      ensureVisibleFocus(el as unknown as HTMLElement,);
      expect(el.classList.contains("focus-hidden",),).toBe(false,);
      expect(el.classList.contains("focus-visible",),).toBe(true,);
    });
  });

  describe("isInViewport", () => {
    it("returns true when fully inside the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 10, left: 10, bottom: 100, right: 100, };
      expect(isInViewport(el as unknown as Element,),).toBe(true,);
    });

    it("returns true at the exact viewport boundary", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 0, left: 0, bottom: 800, right: 600, };
      expect(isInViewport(el as unknown as Element,),).toBe(true,);
    });

    it("returns false when above the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: -5, left: 10, bottom: 100, right: 100, };
      expect(isInViewport(el as unknown as Element,),).toBe(false,);
    });

    it("returns false when left of the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 10, left: -5, bottom: 100, right: 100, };
      expect(isInViewport(el as unknown as Element,),).toBe(false,);
    });

    it("returns false when below the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 10, left: 10, bottom: 900, right: 100, };
      expect(isInViewport(el as unknown as Element,),).toBe(false,);
    });

    it("returns false when right of the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 10, left: 10, bottom: 100, right: 700, };
      expect(isInViewport(el as unknown as Element,),).toBe(false,);
    });

    it("falls back to documentElement dimensions when window metrics are absent", () => {
      // window.innerHeight undefined → the || falls back to documentElement.
      (globalThis as { window?: unknown }).window = {} as unknown as Window;
      const el = new FakeElement("div",);
      el.rect = { top: 0, left: 0, bottom: 800, right: 600, };
      expect(isInViewport(el as unknown as Element,),).toBe(true,);
      el.rect = { top: 0, left: 0, bottom: 801, right: 600, };
      expect(isInViewport(el as unknown as Element,),).toBe(false,);
    });
  });

  describe("focusIntoView", () => {
    it("scrolls the element into view centered", () => {
      const el = new FakeElement("div",);
      focusIntoView(el as unknown as HTMLElement,);
      expect(el.scrollIntoViewCalls,).toEqual([{ block: "center", inline: "center", },],);
    });

    it("scrolls the window by a non-zero offset", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 0, left: 0, bottom: 10, right: 10, };
      focusIntoView(el as unknown as HTMLElement, 50,);
      expect(scrollByCalls,).toEqual([{ x: 0, y: 50, },],);
    });

    it("does not scroll the window when the offset is zero", () => {
      const el = new FakeElement("div",);
      focusIntoView(el as unknown as HTMLElement,);
      expect(scrollByCalls,).toEqual([],);
    });

    it("focuses the element when it is in the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 0, left: 0, bottom: 10, right: 10, };
      focusIntoView(el as unknown as HTMLElement,);
      expect(el.focused,).toBe(true,);
    });

    it("does not focus when the element is outside the viewport", () => {
      const el = new FakeElement("div",);
      el.rect = { top: 5000, left: 0, bottom: 5100, right: 10, };
      focusIntoView(el as unknown as HTMLElement,);
      expect(el.focused,).toBe(false,);
    });
  });

  describe("FocusPortal", () => {
    it("enter stores the active element and focuses the first focusable", () => {
      const prev = new FakeElement("button",);
      fakeDocument.activeElement = prev;
      const first = new FakeElement("input",);
      const portal = new FocusPortal();
      portal.enter(containerWith([first,],),);
      expect(first.focused,).toBe(true,);
      portal.exit();
      expect(prev.focused,).toBe(true,);
    });

    it("exit without enter does nothing", () => {
      const portal = new FocusPortal();
      expect(() => portal.exit()).not.toThrow();
    });

    it("enter with no focusables leaves focus unchanged", () => {
      const prev = new FakeElement("button",);
      fakeDocument.activeElement = prev;
      const portal = new FocusPortal();
      portal.enter(containerWith([],),);
      expect(prev.focused,).toBe(false,);
      portal.exit();
      expect(prev.focused,).toBe(true,);
    });
  });

  describe("escape key handling", () => {
    it("closes the sidebar when open and skips the registered handler", () => {
      const sidebar = new FakeElement("aside",);
      sidebar.classList.add("open",);
      selectorRegistry.set("#layout-sidebar", sidebar,);
      let handlerCalls = 0;
      escapeUnregister = onEscapeKey(() => {
        handlerCalls += 1;
      },);

      handleEscapeKey();
      expect(closeSidebarCalls,).toBe(1,);
      expect(handlerCalls,).toBe(0,);
    });

    it("calls the registered handler when the sidebar is closed", () => {
      const sidebar = new FakeElement("aside",);
      selectorRegistry.set("#layout-sidebar", sidebar,);
      let handlerCalls = 0;
      escapeUnregister = onEscapeKey(() => {
        handlerCalls += 1;
      },);

      handleEscapeKey();
      expect(closeSidebarCalls,).toBe(0,);
      expect(handlerCalls,).toBe(1,);
    });

    it("does nothing when no handler is registered", () => {
      expect(() => handleEscapeKey()).not.toThrow();
    });

    it("unregistering stops handler invocation", () => {
      const sidebar = new FakeElement("aside",);
      selectorRegistry.set("#layout-sidebar", sidebar,);
      let handlerCalls = 0;
      escapeUnregister = onEscapeKey(() => {
        handlerCalls += 1;
      },);

      escapeUnregister();
      escapeUnregister = null;
      handleEscapeKey();
      expect(handlerCalls,).toBe(0,);
    });

    it("a newly registered handler replaces the previous one", () => {
      const sidebar = new FakeElement("aside",);
      selectorRegistry.set("#layout-sidebar", sidebar,);
      let first = 0;
      let second = 0;
      onEscapeKey(() => {
        first += 1;
      },);

      escapeUnregister = onEscapeKey(() => {
        second += 1;
      },);

      handleEscapeKey();
      expect(first,).toBe(0,);
      expect(second,).toBe(1,);
    });
  });
});
