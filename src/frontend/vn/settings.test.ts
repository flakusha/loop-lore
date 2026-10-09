// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { getVnSettings, saveVnSettings, } from "./settings";

/** Minimal Web Storage stub for Bun's test environment (no DOM). */
function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index,) {
      return Array.from(store.keys(),)[index] ?? null;
    },
    getItem(key,) {
      return store.get(key,) ?? null;
    },
    setItem(key, value,) {
      store.set(key, String(value,),);
    },
    removeItem(key,) {
      store.delete(key,);
    },
    clear() {
      store.clear();
    },
  };
}

describe("getVnSettings enabled precedence", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorageStub();
  },);

  test("renderingOverride=visual_novel enables VN even without stored state", () => {
    const settings = getVnSettings({ renderingOverride: "visual_novel", },);
    expect(settings.enabled,).toBe(true,);
  });

  test("explicit-null override falls back to legacy visualNovel boolean", () => {
    const settings = getVnSettings({ renderingOverride: null, visualNovel: true, },);
    expect(settings.enabled,).toBe(true,);
  });

  test("renderingOverride=text overrides legacy visualNovel boolean", () => {
    const settings = getVnSettings({ renderingOverride: "text", visualNovel: true, },);
    expect(settings.enabled,).toBe(false,);
  });

  test("absent override uses stored localStorage enabled state", () => {
    saveVnSettings({ enabled: true, },);
    const settings = getVnSettings({},);
    expect(settings.enabled,).toBe(true,);
  });
});

describe("getVnSettings vnChoicesEnabled", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorageStub();
  },);

  test("defaults to off when gm_config carries no flag", () => {
    expect(getVnSettings({ vnLayout: "overlay", },).vnChoicesEnabled,).toBe(false,);
  });

  test("reads true from gm_config", () => {
    expect(getVnSettings({ vnChoicesEnabled: true, },).vnChoicesEnabled,).toBe(true,);
  });

  test("reads false from gm_config", () => {
    expect(getVnSettings({ vnChoicesEnabled: false, },).vnChoicesEnabled,).toBe(false,);
  });

  // The one that matters: every sibling field falls back to localStorage, but
  // this one is a per-chat permission. If it ever joins the stored merge, an
  // opt-in on chat A silently enables cards on chat B.
  test("does NOT leak across chats via localStorage", () => {
    saveVnSettings({ vnChoicesEnabled: true, },);

    const optedIn = getVnSettings({ vnChoicesEnabled: true, },);
    expect(optedIn.vnChoicesEnabled,).toBe(true,);

    // Same browser, next chat: its gm_config says nothing about choices.
    const other = getVnSettings({ vnLayout: "overlay", },);
    expect(other.vnChoicesEnabled,).toBe(false,);
  });

  test("a stored true cannot re-enable a chat that never opted in", () => {
    saveVnSettings({ vnChoicesEnabled: true, },);
    expect(getVnSettings(undefined,).vnChoicesEnabled,).toBe(false,);
  });

  // Control: the merge IS active for other fields, so the test above is
  // meaningful rather than passing because localStorage is inert here.
  test("other fields still merge from localStorage", () => {
    saveVnSettings({ layout: "split", },);
    expect(getVnSettings({},).layout,).toBe("split",);
  });
});
