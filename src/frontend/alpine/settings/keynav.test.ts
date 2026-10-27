// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Factory coverage for the settings keymap editor submodule: capture mode,
 * validation error surfacing, persistence and reset.
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import {
  isKeyboardNavEnabled,
  KEYMAP_STORAGE_KEY,
  resetKeymapOverrides,
} from "../shortcuts";
import { keynav, } from "./keynav";
import type { SettingsState, } from "./types";

/** Map-backed localStorage stub (repo test convention). */
const storage = new Map<string, string>();
const globals = globalThis as { localStorage?: unknown };

function installStorage(): void {
  globals.localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void storage.set(key, String(value,),),
    removeItem: (key: string,) => void storage.delete(key,),
  };
}

/** Minimal fake keydown event for the capture handler. */
function keyEvent(overrides: Partial<KeyboardEvent>,): KeyboardEvent {
  const base = {
    key: "",
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  return { ...base, ...overrides, } as unknown as KeyboardEvent;
}

/** The editor factory composed with the host state it is bound into. */
function editor(): SettingsState {
  return keynav() as unknown as SettingsState;
}

beforeEach(() => {
  storage.clear();
  installStorage();
  // Invalidate shortcuts.ts's merged-keymap cache between tests.
  resetKeymapOverrides();
},);

describe("settings keynav editor", () => {
  it("loads the effective keymap and the opt-in flag", () => {
    globals.localStorage = {
      getItem: (k: string,) => (k === "keynav" ? "1" : storage.get(k,) ?? null),
      setItem: (k: string, v: string,) => void storage.set(k, v,),
      removeItem: (k: string,) => void storage.delete(k,),
    };

    const ed = editor();
    ed.loadKeymapSection();
    expect(ed.keynavEnabled,).toBe(true,);
    expect(ed.keymap.length,).toBeGreaterThan(0,);
  });

  it("captures a single key and persists an override", () => {
    const ed = editor();
    ed.loadKeymapSection();
    ed.startRebind("scroll-down",);
    ed.handleRebindKeydown(keyEvent({ key: "x", },),);
    expect(ed.rebindingAction,).toBe("",);
    expect(ed.keymap.find((e,) => e.action === "scroll-down")?.combo,).toBe("x",);
    expect(storage.get(KEYMAP_STORAGE_KEY,),).toContain("scroll-down",);
  });

  it("captures a g-sequence across two keydowns", () => {
    const ed = editor();
    ed.loadKeymapSection();
    ed.startRebind("scroll-up",);
    ed.handleRebindKeydown(keyEvent({ key: "g", },),);
    expect(ed.rebindAwaitSecond,).toBe(true,);
    ed.handleRebindKeydown(keyEvent({ key: "w", },),);
    expect(ed.keymap.find((e,) => e.action === "scroll-up")?.combo,).toBe("g w",);
  });

  it("surfaces a validation error for duplicates and reserved keys", () => {
    const ed = editor();
    ed.loadKeymapSection();
    ed.startRebind("scroll-down",);
    ed.handleRebindKeydown(keyEvent({ key: "k", },),);
    expect(ed.keynavError,).toBe("frontend.keynav.editor.duplicate",);
    ed.startRebind("scroll-down",);
    ed.handleRebindKeydown(keyEvent({ key: "?", },),);
    expect(ed.keynavError,).toBe("frontend.keynav.editor.reserved",);
  });

  it("Escape cancels capture without persisting", () => {
    const ed = editor();
    ed.loadKeymapSection();
    ed.startRebind("scroll-down",);
    ed.handleRebindKeydown(keyEvent({ key: "Escape", },),);
    expect(ed.rebindingAction,).toBe("",);
    expect(storage.has(KEYMAP_STORAGE_KEY,),).toBe(false,);
  });

  it("toggleKeyboardNav persists the flag and refreshes keynavEnabled", () => {
    const ed = editor();
    ed.loadKeymapSection();
    expect(ed.keynavEnabled,).toBe(false,);
    ed.toggleKeyboardNav(true,);
    expect(ed.keynavEnabled,).toBe(true,);
    expect(isKeyboardNavEnabled(),).toBe(true,);
    ed.toggleKeyboardNav(false,);
    expect(ed.keynavEnabled,).toBe(false,);
    expect(isKeyboardNavEnabled(),).toBe(false,);
  });

  it("actionLabel translates via the i18n module and falls back to the raw id", () => {
    const ed = editor();
    const g = globalThis as unknown as { __localeStrings?: unknown };
    const saved = g.__localeStrings;
    // The fallback assertion needs an EMPTY catalog: bun runs every test file
    // in one process, so an earlier file may already have loaded the real
    // en.json catalog into this shared global.
    g.__localeStrings = {};
    expect(ed.actionLabel("scroll-down",),).toBe("scroll-down",);
    g.__localeStrings = {
      frontend: { keynav: { actions: { "scroll-down": "Desplazar hacia abajo", }, }, },
    };

    expect(ed.actionLabel("scroll-down",),).toBe("Desplazar hacia abajo",);
    g.__localeStrings = saved;
  });

  it("reset clears stored overrides", () => {
    const ed = editor();
    ed.loadKeymapSection();
    ed.startRebind("scroll-down",);
    ed.handleRebindKeydown(keyEvent({ key: "x", },),);
    ed.resetKeymapToDefaults();
    expect(storage.has(KEYMAP_STORAGE_KEY,),).toBe(false,);
    expect(ed.keymap.find((e,) => e.action === "scroll-down")?.combo,).toBe("j",);
  });
});
