// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Factory coverage for the keynav help overlay component (fake-DOM style:
 * window stub + captured listeners, no real browser).
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { DEFAULT_KEYMAP, resetKeymapOverrides, } from "./shortcuts";

const listeners = new Map<string, () => void>();
const flags = new Map<string, string>();

// This file replaces the global window/document/localStorage with minimal
// stubs and stores a keymap override. Bun runs every test file in one process,
// so without a restore both the stubs and the override leak into later files
// and break their window guards / keymap expectations.
const globals = globalThis as { window?: unknown; document?: unknown; localStorage?: unknown };
const originalWindow = globals.window;
const originalDocument = globals.document;
const originalLocalStorage = globals.localStorage;

afterEach(() => {
  globals.window = originalWindow;
  globals.document = originalDocument;
  globals.localStorage = originalLocalStorage;
  resetKeymapOverrides();
},);

function installWindow(keynavFlag: string | null,): void {
  listeners.clear();
  flags.clear();
  if (keynavFlag !== null) { flags.set("keynav", keynavFlag,); }
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, fn: () => void,) => void listeners.set(type, fn,),
  };

  (globalThis as { document?: unknown }).document = {
    body: { style: { overflow: "", }, },
    addEventListener: () => {},
    querySelector: () => null,
  };

  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string,) => flags.get(key,) ?? null,
    setItem: (key: string, value: string,) => void flags.set(key, String(value,),),
    removeItem: (key: string,) => void flags.delete(key,),
  };
}

async function freshHelp(): Promise<typeof import("./keynav-help")> {
  return await import("./keynav-help" + "?factory-test");
}

describe("keynavHelp", () => {
  it("is opt-in: toggle is inert while the keynav flag is unset", async () => {
    installWindow(null,);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    expect(help.navEnabled,).toBe(false,);
    help.toggle();
    expect(help.open,).toBe(false,);
  });

  it("registers a keynav:toggle-help listener at init and toggles when enabled", async () => {
    installWindow("1",);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.init();
    expect(listeners.get("keynav:toggle-help",),).toBeDefined();
    listeners.get("keynav:toggle-help",)!();
    expect(help.open,).toBe(true,);
    expect(document.body.style.overflow,).toBe("hidden",);
    listeners.get("keynav:toggle-help",)!();
    expect(help.open,).toBe(false,);
    expect(document.body.style.overflow,).toBe("",);
  });

  it("re-reads the keymap (including overrides) on open", async () => {
    installWindow("1",);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    expect(help.shortcuts,).toEqual(DEFAULT_KEYMAP,);
    const { setKeymapOverride, } = await import("./shortcuts");
    setKeymapOverride("scroll-down", "x",);
    help.toggle();
    expect(help.shortcuts.find((s,) => s.action === "scroll-down")?.combo,).toBe("x",);
  });

  it("close() releases the scroll lock and is idempotent", async () => {
    installWindow("1",);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.close();
    expect(help.open,).toBe(false,);
    help.toggle();
    help.close();
    expect(help.open,).toBe(false,);
    expect(document.body.style.overflow,).toBe("",);
  });

  it("label() translates via the i18n module and falls back to the action id", async () => {
    installWindow("1",);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    const g = globalThis as unknown as { __localeStrings?: unknown };
    const saved = g.__localeStrings;
    // The fallback assertion needs an EMPTY catalog: bun runs every test file
    // in one process, so an earlier file may already have loaded the real
    // en.json catalog into this shared global.
    g.__localeStrings = {};
    expect(help.label("scroll-down",),).toBe("scroll-down",);
    g.__localeStrings = {
      frontend: { keynav: { actions: { "scroll-down": "Scroll down", }, }, },
    };

    expect(help.label("scroll-down",),).toBe("Scroll down",);
    g.__localeStrings = saved;
  });
});

// ── Focus trap ──────────────────────────────────────────────────────────

const rafQueue: Array<() => void> = [];

/** Selectors the overlay component uses to find its parts. */
const OVERLAY_SELECTOR = '[data-testid="keynav-help-overlay"]';
const TRIGGER_SELECTOR = '[data-testid="keynav-help-button"]';
const MAIN_SELECTOR = '[role="main"], #app-root';

/** Element stand-in: focus() only lands while the fake document is visible. */
class FakeElement {
  focused = false;
  /** Mirrors HTMLElement.isConnected — false once the element was swapped out. */
  isConnected = true;
  readonly attributes = new Map<string, string>();

  constructor(
    private readonly doc: FakeDocument,
    readonly children: FakeElement[] = [],
  ) {}

  focus(): void {
    if (!this.doc.visible) { return; }
    this.focused = true;
    this.doc.activeElement = this;
  }

  contains(node: unknown,): boolean {
    return node === this || this.children.some((child,) => child.contains(node,));
  }

  querySelectorAll(): FakeElement[] {
    return this.children;
  }

  setAttribute(name: string, value: string,): void {
    this.attributes.set(name, value,);
  }

  getAttribute(name: string,): string | null {
    return this.attributes.get(name,) ?? null;
  }
}

/** Fake document with selector routing and one listener list per event type. */
class FakeDocument {
  activeElement: unknown = null;
  visible = true;
  readonly body = { style: { overflow: "", }, };
  readonly elements = new Map<string, FakeElement>();
  readonly listeners = new Map<string, Array<(event: KeyboardEvent,) => void>>();

  addEventListener(type: string, fn: (event: KeyboardEvent,) => void,): void {
    const handlers = this.listeners.get(type,) ?? [];
    handlers.push(fn,);
    this.listeners.set(type, handlers,);
  }

  removeEventListener(type: string, fn: (event: KeyboardEvent,) => void,): void {
    const handlers = this.listeners.get(type,) ?? [];
    const index = handlers.indexOf(fn,);
    if (index >= 0) { handlers.splice(index, 1,); }
  }

  querySelector(selector: string,): FakeElement | null {
    return this.elements.get(selector,) ?? null;
  }
}

interface FocusDom {
  doc: FakeDocument;
  trigger: FakeElement;
  overlay: FakeElement;
  focusables: FakeElement[];
  main: FakeElement;
}

/** The document installed by the last installFocusDom() call. */
let currentDoc: FakeDocument | null = null;

/** Install a fake document whose overlay can take focus. */
function installFocusDom(options?: { empty?: boolean },): FocusDom {
  installWindow("1",);
  rafQueue.length = 0;
  const doc = new FakeDocument();
  const trigger = new FakeElement(doc,);
  const closeButton = new FakeElement(doc,);
  const panel = new FakeElement(doc,);
  const overlay = new FakeElement(doc, options?.empty ? [] : [closeButton, panel,],);
  const main = new FakeElement(doc,);
  doc.activeElement = trigger;
  doc.elements.set(OVERLAY_SELECTOR, overlay,);
  doc.elements.set(TRIGGER_SELECTOR, trigger,);
  doc.elements.set(MAIN_SELECTOR, main,);
  currentDoc = doc;
  (globalThis as { document?: unknown }).document = doc;

  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (fn: () => void,) => {
    rafQueue.push(fn,);
    return rafQueue.length;
  };

  return { doc, trigger, overlay, focusables: [closeButton, panel,], main, };
}

/** Fire a keydown at the document-level listeners. */
function pressKey(key: string, shiftKey = false,): { prevented: boolean } {
  const event = {
    key,
    shiftKey,
    prevented: false,
    preventDefault(): void {
      event.prevented = true;
    },
  };

  for (const handler of [...(currentDoc?.listeners.get("keydown",) ?? []),]) {
    handler(event as unknown as KeyboardEvent,);
  }

  return event;
}

/** Fire a Tab keydown at the document-level focus trap. */
function pressTab(shiftKey = false,): { prevented: boolean } {
  return pressKey("Tab", shiftKey,);
}

describe("keynavHelp focus trap", () => {
  it("moves focus into the overlay on open and restores it on close", async () => {
    const { doc, trigger, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);
    help.close();
    expect(doc.activeElement,).toBe(trigger,);
  });

  it("waits for the overlay to become visible before moving focus in", async () => {
    const { doc, focusables, } = installFocusDom();
    doc.visible = false;
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).not.toBe(focusables[0],);
    doc.visible = true;
    rafQueue.shift()?.();
    expect(doc.activeElement,).toBe(focusables[0],);
    help.close();
  });

  it("keeps Tab and Shift+Tab inside the overlay", async () => {
    const { doc, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);

    const forward = pressTab();
    expect(forward.prevented,).toBe(true,);
    expect(doc.activeElement,).toBe(focusables[1],);

    const wrapped = pressTab();
    expect(wrapped.prevented,).toBe(true,);
    expect(doc.activeElement,).toBe(focusables[0],);

    const backward = pressTab(true,);
    expect(backward.prevented,).toBe(true,);
    expect(doc.activeElement,).toBe(focusables[1],);
    help.close();
  });

  it("pulls focus back into the overlay when it has escaped", async () => {
    const { doc, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    doc.activeElement = new FakeElement(doc,);
    pressTab();
    expect(doc.activeElement,).toBe(focusables[0],);
    help.close();
  });

  it("does not trap focus while the overlay is closed", async () => {
    const { doc, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    const outside = new FakeElement(doc,);
    doc.activeElement = outside;

    const before = pressTab();
    expect(before.prevented,).toBe(false,);
    expect(doc.activeElement,).toBe(outside,);

    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);
    help.close();

    doc.activeElement = outside;
    pressTab();
    expect(doc.activeElement,).toBe(outside,);
  });

  it("closes the overlay on Escape and restores the focus", async () => {
    const { doc, trigger, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);

    pressKey("Escape",);
    expect(help.open,).toBe(false,);
    expect(doc.activeElement,).toBe(trigger,);
  });

  it("keeps the focus on the overlay container when it has no focusable control", async () => {
    const { doc, overlay, } = installFocusDom({ empty: true, },);
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(overlay,);
    expect(overlay.getAttribute("tabindex",),).toBe("-1",);

    const tab = pressTab();
    expect(tab.prevented,).toBe(true,);
    expect(doc.activeElement,).toBe(overlay,);
    help.close();
  });

  it("restores the focus to the help trigger when the overlay was opened from the body", async () => {
    const { doc, trigger, focusables, } = installFocusDom();
    doc.activeElement = doc.body;
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);
    help.close();
    expect(doc.activeElement,).toBe(trigger,);
  });

  it("falls back to the app root when the trigger was removed", async () => {
    const { doc, trigger, main, focusables, } = installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(doc.activeElement,).toBe(focusables[0],);

    // An htmx swap removed the trigger while the overlay was open.
    trigger.isConnected = false;
    doc.elements.delete(TRIGGER_SELECTOR,);
    help.close();
    expect(doc.activeElement,).toBe(main,);
  });
});
