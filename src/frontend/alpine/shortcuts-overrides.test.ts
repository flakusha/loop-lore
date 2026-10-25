// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for the keymap override layer in shortcuts.ts:
 * merge over DEFAULT_KEYMAP, validation rules, persistence round-trip
 * and the malformed-storage fallback.
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import {
  DEFAULT_KEYMAP,
  getKeymap,
  KEYMAP_STORAGE_KEY,
  resetKeymapOverrides,
  setKeymapOverride,
  validateKeymapCombo,
} from "./shortcuts";

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

/** Combo currently bound to an action in the effective keymap. */
function comboFor(action: string,): string | undefined {
  return getKeymap().find((e,) => e.action === action)?.combo;
}

beforeEach(() => {
  storage.clear();
  installStorage();
  resetKeymapOverrides();
},);

describe("keymap overrides", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(getKeymap(),).toEqual(DEFAULT_KEYMAP,);
  });

  it("merges a stored override over the default combo", () => {
    setKeymapOverride("scroll-down", "x",);
    expect(comboFor("scroll-down",),).toBe("x",);
    // Untouched entries keep their default combos.
    expect(comboFor("scroll-up",),).toBe("k",);
  });

  it("drops an override that equals the default combo", () => {
    setKeymapOverride("scroll-down", "x",);
    setKeymapOverride("scroll-down", "j",);
    expect(storage.get(KEYMAP_STORAGE_KEY,),).not.toContain("scroll-down",);
    expect(comboFor("scroll-down",),).toBe("j",);
  });

  it("falls back to defaults for malformed stored JSON", () => {
    storage.set(KEYMAP_STORAGE_KEY, "{not json",);
    expect(getKeymap(),).toEqual(DEFAULT_KEYMAP,);
  });

  it("falls back to defaults for non-object stored JSON", () => {
    storage.set(KEYMAP_STORAGE_KEY, "[1,2,3]",);
    expect(getKeymap(),).toEqual(DEFAULT_KEYMAP,);
  });

  it("ignores entries whose override is not a string", () => {
    storage.set(KEYMAP_STORAGE_KEY, JSON.stringify({ "scroll-down": 42, "scroll-up": "x", },),);
    expect(comboFor("scroll-down",),).toBe("j",);
    expect(comboFor("scroll-up",),).toBe("x",);
  });

  it("restores defaults on reset", () => {
    setKeymapOverride("scroll-down", "x",);
    resetKeymapOverrides();
    expect(getKeymap(),).toEqual(DEFAULT_KEYMAP,);
    expect(storage.has(KEYMAP_STORAGE_KEY,),).toBe(false,);
  });
});

describe("validateKeymapCombo", () => {
  const map = () => getKeymap();

  it("accepts a free single key", () => {
    expect(validateKeymapCombo("x", "scroll-down", map(),),).toEqual({ ok: true, },);
  });

  it("accepts a free g-sequence", () => {
    expect(validateKeymapCombo("g w", "scroll-down", map(),),).toEqual({ ok: true, },);
  });

  it("rejects an empty or oversized combo", () => {
    expect(validateKeymapCombo("", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("g g g", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("abcd", "scroll-down", map(),).ok,).toBe(false,);
  });

  it("rejects bare modifiers", () => {
    expect(validateKeymapCombo("Shift", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("g Control", "scroll-down", map(),).ok,).toBe(false,);
  });

  it("rejects reserved combos", () => {
    expect(validateKeymapCombo("?", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("Escape", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("g", "scroll-down", map(),).ok,).toBe(false,);
  });

  it("rejects combos already bound to another action", () => {
    expect(validateKeymapCombo("k", "scroll-down", map(),).ok,).toBe(false,);
    expect(validateKeymapCombo("g g", "scroll-down", map(),).ok,).toBe(false,);
  });

  it("allows rebinding an action to its own current combo", () => {
    expect(validateKeymapCombo("j", "scroll-down", map(),),).toEqual({ ok: true, },);
  });
});
