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
    expect(help.label("scroll-down",),).toBe("scroll-down",);
    const g = globalThis as unknown as { __localeStrings?: unknown };
    const saved = g.__localeStrings;
    g.__localeStrings = {
      frontend: { keynav: { actions: { "scroll-down": "Scroll down", }, }, },
    };

    expect(help.label("scroll-down",),).toBe("Scroll down",);
    g.__localeStrings = saved;
  });
});

// ── Focus trap ──────────────────────────────────────────────────────────

const docListeners = new Map<string, (event: KeyboardEvent,) => void>();
const rafQueue: Array<() => void> = [];

/** Element stand-in: focus() only lands while the fake document is visible. */
class FakeElement {
  focused = false;

  constructor(
    private readonly doc: { activeElement: unknown; visible: boolean },
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
}

interface FocusDom {
  doc: { activeElement: unknown; visible: boolean };
  trigger: FakeElement;
  focusables: FakeElement[];
}

/** Install a fake document whose overlay can take focus. */
function installFocusDom(): FocusDom {
  installWindow("1",);
  docListeners.clear();
  rafQueue.length = 0;
  const doc = { activeElement: null as unknown, visible: true, };
  const trigger = new FakeElement(doc,);
  const closeButton = new FakeElement(doc,);
  const panel = new FakeElement(doc,);
  const overlay = new FakeElement(doc, [closeButton, panel,],);
  doc.activeElement = trigger;
  (globalThis as { document?: unknown }).document = {
    get activeElement() {
      return doc.activeElement;
    },
    body: { style: { overflow: "", }, },
    addEventListener: (type: string, fn: (event: KeyboardEvent,) => void,) => {
      docListeners.set(type, fn,);
    },
    removeEventListener: (type: string,) => {
      docListeners.delete(type,);
    },
    querySelector: () => overlay,
  };

  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (fn: () => void,) => {
    rafQueue.push(fn,);
    return rafQueue.length;
  };

  return { doc, trigger, focusables: [closeButton, panel,], };
}

/** Fire a Tab keydown at the document-level focus trap. */
function pressTab(shiftKey = false,): { prevented: boolean } {
  const event = {
    key: "Tab",
    shiftKey,
    prevented: false,
    preventDefault(): void {
      event.prevented = true;
    },
  };

  docListeners.get("keydown",)?.(event as unknown as KeyboardEvent,);
  return event;
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

  it("releases the trap on close", async () => {
    installFocusDom();
    const { keynavHelp, } = await freshHelp();
    const help = keynavHelp();
    help.toggle();
    expect(docListeners.has("keydown",),).toBe(true,);
    help.close();
    expect(docListeners.has("keydown",),).toBe(false,);
  });
});
