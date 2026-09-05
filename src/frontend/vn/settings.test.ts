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
