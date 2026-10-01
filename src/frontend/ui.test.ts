// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for ui.ts: sidebar toggling, toast lifecycle, modal
 * focus trap + restore, theme application, and translation interpolation.
 *
 * The module under test is imported dynamically: mock.module must be
 * registered before ui.ts first loads (module-loading boundary).
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

let trapFocusCalls: unknown[] = [];
let trapCleanups: Array<() => void> = [];
let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: (url: string, opts?: RequestInit,) => Promise<Response> = async () =>
  new Response("{}", { status: 200, },);

if (ISOLATED) {
  mock.module("./alpine/focus", () => ({
    trapFocus: (container: unknown,) => {
      trapFocusCalls.push(container,);
      const cleanup = () => {
        trapCleanups.push(cleanup,);
      };
      return cleanup;
    },
  }),);
}

// Real dom + i18n + fe-fetch: loadTranslations resolves through the global
// fetch stub installed in beforeEach, so ui.ts's loadLocale/setLocale run
// their full integration path.
type FetchOpts = Record<string, unknown>;
const realFetch = globalThis.fetch;
// `CSS`/`Alpine` are never installed by src/ (Alpine is a CDN global), but
// `__localeStrings` and `__THEMES` ARE set app-wide by src/frontend/ui.ts and
// src/frontend/alpine/theme.ts. beforeEach deletes them to force the unloaded
// path, so snapshot them here and restore in afterEach - otherwise a later
// test file in a shared process inherits them missing.
const realLocaleStrings = (globalThis as { __localeStrings?: unknown }).__localeStrings;
const realThemes = (globalThis as { __THEMES?: unknown }).__THEMES;
const realCSS = (globalThis as { CSS?: unknown }).CSS;
const realAlpine = (globalThis as { Alpine?: unknown }).Alpine;

// ── fake DOM ────────────────────────────────────────────────

type ClassList = {
  _set: Set<string>;
  add(...cs: string[]): void;
  remove(...cs: string[]): void;
  toggle(c: string, force?: boolean,): void;
  contains(c: string,): boolean;
};

type El = {
  tagName: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  children: El[];
  parentNode: El | null;
  textContent: string;
  innerHTML: string;
  className: string;
  value: string;
  type: string;
  disabled: boolean;
  lang: string;
  classList: ClassList;
  setAttribute(k: string, v: string,): void;
  getAttribute(k: string,): string | null;
  append(...kids: El[]): void;
  querySelector(sel: string,): El | null;
  closest(sel: string,): El | null;
  focus(): void;
  remove(): void;
  click(): void;
  addEventListener(type: string, fn: () => void,): void;
  getHTML(): string;
  _qs: Record<string, El>;
  _closest: (sel: string,) => El | null;
  _listeners: Map<string, Array<() => void>>;
};

function makeEl(
  tag: string,
  qs: Record<string, El> = {},
  closest: (sel: string,) => El | null = () => null,
): El {
  const node: El = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    attributes: {},
    children: [],
    parentNode: null,
    textContent: "",
    innerHTML: "",
    className: "",
    value: "",
    type: "",
    disabled: false,
    lang: "",
    classList: {
      _set: new Set<string>(),
      add(...cs) {
        for (const c of cs) {
          this._set.add(c,);
        }
      },
      remove(...cs) {
        for (const c of cs) {
          this._set.delete(c,);
        }
      },
      toggle(c, force,) {
        const want = force ?? !this._set.has(c,);
        if (want) {
          this._set.add(c,);
        } else {
          this._set.delete(c,);
        }
      },
      contains(c,) {
        return this._set.has(c,);
      },
    },
    setAttribute(k, v,) {
      node.attributes[k] = String(v,);
    },
    getAttribute(k,) {
      return k in node.attributes ? (node.attributes[k] as string) : null;
    },
    append(...kids) {
      for (const k of kids) {
        k.parentNode = node;
        node.children.push(k,);
      }
    },
    querySelector(sel,) {
      return node._qs[sel] ?? null;
    },
    closest(sel,) {
      return node._closest(sel,);
    },
    focus() {
      focused.push(node,);
    },
    remove() {
      if (node.parentNode) {
        const i = node.parentNode.children.indexOf(node,);
        if (i >= 0) {
          node.parentNode.children.splice(i, 1,);
        }
        node.parentNode = null;
      }
    },
    click() {
      for (const fn of [...(node._listeners.get("click",) ?? []),]) {
        fn();
      }
    },
    addEventListener(type, fn,) {
      const arr = node._listeners.get(type,) ?? [];
      arr.push(fn,);
      node._listeners.set(type, arr,);
    },
    getHTML() {
      return node.textContent;
    },
    _qs: qs,
    _closest: closest,
    _listeners: new Map(),
  };
  return node;
}

type FakeDoc = {
  selectors: Map<string, El>;
  body: El;
  documentElement: El;
  activeElement: El | null;
  cookie: string;
  querySelector(sel: string,): El | null;
  createElement(tag: string,): El;
  addEventListener(): void;
  removeEventListener(): void;
};

const realDoc = globalThis.document;
const storage = new Map<string, string>();
const focused: El[] = [];
let doc: FakeDoc;
let sidebarStore: { open: boolean };
let ui: typeof import("./ui");

function installStorage(): void {
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string,) => (storage.has(k,) ? (storage.get(k,) as string) : null),
    setItem: (k: string, v: string,) => {
      storage.set(k, v,);
    },
    removeItem: (k: string,) => {
      storage.delete(k,);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve();
  }
}

beforeEach(async () => {
  trapFocusCalls = [];
  trapCleanups = [];
  fetchCalls = [];
  fetchHandler = async () => new Response("{}", { status: 200, },);
  focused.length = 0;
  storage.clear();
  installStorage();
  doc = {
    selectors: new Map(),
    body: makeEl("body",),
    documentElement: makeEl("html",),
    activeElement: null,
    cookie: "",
    querySelector(sel,) {
      return this.selectors.get(sel,) ?? null;
    },
    createElement(tag,) {
      return makeEl(tag,);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  (globalThis as { document: unknown }).document = doc;
  (globalThis as { CSS: unknown }).CSS = { escape: (s: string,) => s, };
  sidebarStore = { open: false, };
  (globalThis as { Alpine: unknown }).Alpine = {
    store: (name: string,) => (name === "sidebar" ? sidebarStore : {}),
    initTree: () => {},
  };
  (globalThis as { fetch: unknown }).fetch = (url: string, opts?: FetchOpts,) => {
    fetchCalls.push({ url, opts, },);
    return fetchHandler(url, opts,);
  };
  delete (globalThis as { __localeStrings?: unknown }).__localeStrings;
  delete (globalThis as { __THEMES?: unknown }).__THEMES;
  ui = await import("./ui");
},);

afterEach(() => {
  (globalThis as { document: unknown }).document = realDoc;
  (globalThis as { fetch: unknown }).fetch = realFetch;
  (globalThis as { CSS?: unknown }).CSS = realCSS;
  (globalThis as { Alpine?: unknown }).Alpine = realAlpine;
  (globalThis as { __localeStrings?: unknown }).__localeStrings = realLocaleStrings;
  (globalThis as { __THEMES?: unknown }).__THEMES = realThemes;
},);

// ── sidebar ────────────────────────────────────────────────

describeOrSkip("toggleSidebar", () => {
  test("opens sidebar, backdrop, body class, and Alpine store", () => {
    const sidebar = makeEl("aside",);
    const backdrop = makeEl("div",);
    doc.selectors.set("#layout-sidebar", sidebar,);
    doc.selectors.set("#sidebar-backdrop", backdrop,);
    ui.toggleSidebar();
    expect(sidebar.classList.contains("open",),).toBe(true,);
    expect(backdrop.style.display,).toBe("block",);
    expect(backdrop.classList.contains("open",),).toBe(true,);
    expect(doc.body.classList.contains("sidebar-open",),).toBe(true,);
    expect(sidebarStore.open,).toBe(true,);
  });

  test("closes an open sidebar", () => {
    const sidebar = makeEl("aside",);
    sidebar.classList.add("open",);
    const backdrop = makeEl("div",);
    backdrop.classList.add("open",);
    backdrop.style.display = "block";
    doc.body.classList.add("sidebar-open",);
    doc.selectors.set("#layout-sidebar", sidebar,);
    doc.selectors.set("#sidebar-backdrop", backdrop,);
    ui.toggleSidebar();
    expect(sidebar.classList.contains("open",),).toBe(false,);
    expect(backdrop.style.display,).toBe("none",);
    expect(backdrop.classList.contains("open",),).toBe(false,);
    expect(doc.body.classList.contains("sidebar-open",),).toBe(false,);
    expect(sidebarStore.open,).toBe(false,);
  });

  test("missing sidebar/backdrop elements do not throw", () => {
    expect(() => ui.toggleSidebar()).not.toThrow();
    expect(doc.body.classList.contains("sidebar-open",),).toBe(true,);
  });

  test("absent Alpine does not throw", () => {
    delete (globalThis as { Alpine?: unknown }).Alpine;
    expect(() => ui.toggleSidebar()).not.toThrow();
  });
},);

describeOrSkip("closeSidebar", () => {
  test("removes open state from sidebar, backdrop, body, and store", () => {
    const sidebar = makeEl("aside",);
    sidebar.classList.add("open",);
    const backdrop = makeEl("div",);
    backdrop.classList.add("open",);
    doc.selectors.set("#layout-sidebar", sidebar,);
    doc.selectors.set("#sidebar-backdrop", backdrop,);
    ui.closeSidebar();
    expect(sidebar.classList.contains("open",),).toBe(false,);
    expect(backdrop.classList.contains("open",),).toBe(false,);
    expect(backdrop.style.display,).toBe("none",);
    expect(doc.body.classList.contains("sidebar-open",),).toBe(false,);
    expect(sidebarStore.open,).toBe(false,);
  });

  test("missing elements do not throw", () => {
    expect(() => ui.closeSidebar()).not.toThrow();
  });
},);

// ── toast ──────────────────────────────────────────────────

describeOrSkip("showToast", () => {
  test("missing toast container is a no-op", () => {
    expect(() => ui.showToast("info", "hello",)).not.toThrow();
  });

  test("appends a success toast with icon, message, and dismiss button", () => {
    const container = makeEl("div",);
    doc.selectors.set("#toast-container", container,);
    ui.showToast("success", "Saved!",);
    expect(container.children.length,).toBe(1,);
    const toast = container.children[0] as El;
    expect(toast.className,).toBe("toast success",);
    expect(toast.attributes["role"],).toBe("status",);
    const [iconEl, msgEl, close,] = toast.children;
    expect(iconEl?.textContent,).toBe("✓",);
    expect(msgEl?.textContent,).toBe("Saved!",);
    expect(close?.className,).toBe("close",);
    expect(close?.type,).toBe("button",);
    expect(close?.attributes["aria-label"],).toBe("Dismiss notification",);
  });

  test("error type uses the error icon", () => {
    const container = makeEl("div",);
    doc.selectors.set("#toast-container", container,);
    ui.showToast("error", "Failed",);
    const toast = container.children[0] as El;
    expect(toast.className,).toBe("toast error",);
    expect(toast.children[0]?.textContent,).toBe("✗",);
  });

  test("unknown type falls back to the info icon", () => {
    const container = makeEl("div",);
    doc.selectors.set("#toast-container", container,);
    ui.showToast("weird", "Hmm",);
    const toast = container.children[0] as El;
    expect(toast.className,).toBe("toast weird",);
    expect(toast.children[0]?.textContent,).toBe("ℹ",);
  });

  test("clicking the dismiss button removes the toast", () => {
    const container = makeEl("div",);
    doc.selectors.set("#toast-container", container,);
    ui.showToast("info", "bye",);
    const toast = container.children[0] as El;
    const close = toast.children[2] as El;
    close.click();
    expect(toast.parentNode,).toBeNull();
    expect(container.children.length,).toBe(0,);
  });
},);

// ── modal ──────────────────────────────────────────────────

describeOrSkip("openModal", () => {
  test("missing modal id is a no-op", () => {
    expect(() => ui.openModal("nope",)).not.toThrow();
    expect(trapFocusCalls.length,).toBe(0,);
  });

  test("opens modal, sets role/aria-modal, traps and focuses first focusable", () => {
    const button = makeEl("button",);
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = makeEl("div", { [selector]: button, },);
    doc.selectors.set("#m1", modal,);
    ui.openModal("m1",);
    expect(modal.classList.contains("open",),).toBe(true,);
    expect(modal.attributes["role"],).toBe("dialog",);
    expect(modal.attributes["aria-modal"],).toBe("true",);
    expect(trapFocusCalls,).toEqual([modal,],);
    expect(focused,).toEqual([button,],);
  });

  test("existing role/aria-modal attributes are preserved", () => {
    const modal = makeEl("div",);
    modal.attributes["role"] = "alertdialog";
    modal.attributes["aria-modal"] = "false";
    doc.selectors.set("#m1", modal,);
    ui.openModal("m1",);
    expect(modal.attributes["role"],).toBe("alertdialog",);
    expect(modal.attributes["aria-modal"],).toBe("false",);
  });
},);

describeOrSkip("closeModal", () => {
  test("closes overlay, releases trap, restores previous focus", () => {
    const overlay = makeEl("div",);
    overlay.classList.add("open",);
    const modal = makeEl("div",);
    doc.selectors.set("#m1", modal,);
    const prev = makeEl("input",);
    doc.activeElement = prev;
    ui.openModal("m1",);
    trapCleanups = [];
    focused.length = 0;
    const btn = makeEl("button", {}, () => overlay,);
    ui.closeModal(btn as unknown as Element,);
    expect(overlay.classList.contains("open",),).toBe(false,);
    expect(trapCleanups.length,).toBe(1,);
    expect(focused,).toEqual([prev,],);
  });

  test("falls back to main content when no previous focus", () => {
    const overlay = makeEl("div",);
    overlay.classList.add("open",);
    const modal = makeEl("div",);
    doc.selectors.set("#m1", modal,);
    ui.openModal("m1",);
    trapCleanups = [];
    focused.length = 0;
    const main = makeEl("main",);
    doc.selectors.set('[role="main"], #app-root', main,);
    const btn = makeEl("button", {}, () => overlay,);
    ui.closeModal(btn as unknown as Element,);
    expect(trapCleanups.length,).toBe(1,);
    expect(focused,).toEqual([main,],);
  });

  test("element outside any overlay still releases the trap", () => {
    const modal = makeEl("div",);
    doc.selectors.set("#m1", modal,);
    ui.openModal("m1",);
    trapCleanups = [];
    const btn = makeEl("button",);
    expect(() => ui.closeModal(btn as unknown as Element,)).not.toThrow();
    expect(trapCleanups.length,).toBe(1,);
  });
},);

describeOrSkip("closeModalOnBackdrop", () => {
  test("ignores events where target !== currentTarget", () => {
    const overlay = makeEl("div",);
    overlay.classList.add("open",);
    const modal = makeEl("div",);
    doc.selectors.set("#m1", modal,);
    ui.openModal("m1",);
    trapCleanups = [];
    const inner = makeEl("div",);
    ui.closeModalOnBackdrop({ target: inner, currentTarget: overlay, } as unknown as Event,);
    expect(overlay.classList.contains("open",),).toBe(true,);
    expect(trapCleanups.length,).toBe(0,);
  });

  test("closes when target === currentTarget", () => {
    const overlay = makeEl("div",);
    overlay.classList.add("open",);
    const modal = makeEl("div",);
    doc.selectors.set("#m1", modal,);
    const prev = makeEl("input",);
    doc.activeElement = prev;
    ui.openModal("m1",);
    trapCleanups = [];
    ui.closeModalOnBackdrop({ target: overlay, currentTarget: overlay, } as unknown as Event,);
    expect(overlay.classList.contains("open",),).toBe(false,);
    expect(trapCleanups.length,).toBe(1,);
    expect(focused,).toEqual([prev,],);
  });
},);

// ── theme ──────────────────────────────────────────────────

describeOrSkip("applyTheme", () => {
  test("unknown or empty theme id is a no-op", () => {
    (globalThis as { __THEMES?: unknown }).__THEMES = [{ id: "default", file: "a.css", },];
    ui.applyTheme("nope",);
    ui.applyTheme("",);
    expect(storage.has("theme-preference",),).toBe(false,);
  });

  test("applies known theme: disables other links, sets no-icons, persists", () => {
    const def = makeEl("link",);
    const noIcons = makeEl("link",);
    doc.selectors.set("#theme-default", def,);
    doc.selectors.set("#theme-no-icons", noIcons,);
    (globalThis as { __THEMES?: unknown }).__THEMES = [
      { id: "default", file: "a.css", },
      { id: "no-icons", file: "b.css", },
    ];
    ui.applyTheme("no-icons",);
    expect(def.disabled,).toBe(true,);
    expect(noIcons.disabled,).toBe(false,);
    expect(doc.body.classList.contains("theme-no-icons",),).toBe(true,);
    expect(storage.get("theme-preference",),).toBe("no-icons",);
    ui.applyTheme("default",);
    expect(def.disabled,).toBe(false,);
    expect(noIcons.disabled,).toBe(true,);
    expect(doc.body.classList.contains("theme-no-icons",),).toBe(false,);
    expect(storage.get("theme-preference",),).toBe("default",);
  });
},);

describeOrSkip("getTheme", () => {
  test("returns the saved preference or the default", () => {
    expect(ui.getTheme(),).toBe("default",);
    storage.set("theme-preference", "dark",);
    expect(ui.getTheme(),).toBe("dark",);
  });
},);

// ── locale / translation ───────────────────────────────────

describeOrSkip("t", () => {
  test("non-string key returns empty string", () => {
    expect(ui.t(42 as unknown as string,),).toBe("",);
  });

  test("missing key returns the key itself", () => {
    (globalThis as { __localeStrings?: unknown }).__localeStrings = {};
    expect(ui.t("missing.key",),).toBe("missing.key",);
  });

  test("resolves nested keys", () => {
    (globalThis as { __localeStrings?: unknown }).__localeStrings = { a: { b: "Deep", }, };
    expect(ui.t("a.b",),).toBe("Deep",);
  });

  test("interpolates params", () => {
    (globalThis as { __localeStrings?: unknown }).__localeStrings = { hello: "Hi {name}", };
    expect(ui.t("hello", { name: "World", },),).toBe("Hi World",);
  });

  test("missing param stays as placeholder", () => {
    (globalThis as { __localeStrings?: unknown }).__localeStrings = { hello: "Hi {name}", };
    expect(ui.t("hello", {},),).toBe("Hi {name}",);
  });
},);

describeOrSkip("loadLocale", () => {
  test("loads strings and applies direction", async () => {
    fetchHandler = async () => new Response(JSON.stringify({ a: "b", },), { status: 200, },);
    await ui.loadLocale("en",);
    expect((globalThis as { __localeStrings?: unknown }).__localeStrings,).toEqual({ a: "b", },);
    expect(doc.documentElement.lang,).toBe("en",);
  });

  test("failed load is a no-op", async () => {
    fetchHandler = async () => new Response("{}", { status: 404, },);
    await ui.loadLocale("en",);
    expect("__localeStrings" in globalThis,).toBe(false,);
    expect(doc.documentElement.lang,).toBe("",);
  });
},);

describeOrSkip("setLocale", () => {
  test("saves locale and kicks off the async load", async () => {
    fetchHandler = async () => new Response(JSON.stringify({ x: "y", },), { status: 200, },);
    ui.setLocale("fr",);
    expect(storage.get("locale",),).toBe("fr",);
    expect(doc.cookie,).toContain("ll_locale=fr",);
    await flushMicrotasks();
    expect((globalThis as { __localeStrings?: unknown }).__localeStrings,).toEqual({ x: "y", },);
    expect(doc.documentElement.lang,).toBe("fr",);
  });
},);
