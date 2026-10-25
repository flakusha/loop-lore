// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Factory coverage for the keynav help overlay component (fake-DOM style:
 * window stub + captured listeners, no real browser).
 */

import { describe, expect, it, } from "bun:test";
import { DEFAULT_KEYMAP, } from "./shortcuts";

const listeners = new Map<string, () => void>();
const flags = new Map<string, string>();

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
