// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * nsfw-blur unit tests — pure preference + reveal-toggle surface.
 *
 * Storage-backed reads are exercised through the guarded localStorage stub
 * (same pattern as settings/general.test.ts); the reveal map helpers and the
 * blur predicate are pure.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  isNsfwBlurPrefOn,
  isNsfwRevealed,
  NSFW_BLUR_STORAGE_KEY,
  shouldBlurNsfw,
  toggleNsfwReveal,
} from "./nsfw-blur";

let backing: Map<string, string>;

/** Install a Map-backed localStorage stub (missing keys read null). */
function installStorage(): void {
  backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string,) => backing.get(key,) ?? null,
      setItem: (key: string, value: string,) => {
        backing.set(key, value,);
      },
    },
  },);
}

beforeEach(() => {
  installStorage();
},);

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage",);
},);

describe("isNsfwBlurPrefOn", () => {
  test("defaults to OFF when the key is missing", () => {
    expect(isNsfwBlurPrefOn(),).toBe(false,);
  });

  test("reads the mirror value '1' as ON", () => {
    backing.set(NSFW_BLUR_STORAGE_KEY, "1",);
    expect(isNsfwBlurPrefOn(),).toBe(true,);
  });

  test("treats any other stored value as OFF", () => {
    backing.set(NSFW_BLUR_STORAGE_KEY, "0",);
    expect(isNsfwBlurPrefOn(),).toBe(false,);
  });

  test("degrades to OFF when storage access throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked",);
      },
    },);

    expect(isNsfwBlurPrefOn(),).toBe(false,);
  });
});

describe("reveal map", () => {
  test("absent keys are not revealed", () => {
    expect(isNsfwRevealed({}, "a1",),).toBe(false,);
  });

  test("toggleNsfwReveal flips a key on and back off, immutably", () => {
    const initial: Record<string, boolean> = {};
    const on = toggleNsfwReveal(initial, "a1",);
    expect(isNsfwRevealed(on, "a1",),).toBe(true,);
    expect(initial,).toEqual({},);

    const off = toggleNsfwReveal(on, "a1",);
    expect(isNsfwRevealed(off, "a1",),).toBe(false,);
    expect(isNsfwRevealed(on, "a1",),).toBe(true,);
  });

  test("toggling one key leaves siblings untouched", () => {
    const on = toggleNsfwReveal({ a1: true, }, "a2",);
    expect(isNsfwRevealed(on, "a1",),).toBe(true,);
    expect(isNsfwRevealed(on, "a2",),).toBe(true,);
  });
});

describe("shouldBlurNsfw", () => {
  test("blurs only flagged media when the preference is on", () => {
    expect(shouldBlurNsfw({ nsfw: true, blurEnabled: true, revealed: false, },),).toBe(true,);
    expect(shouldBlurNsfw({ nsfw: false, blurEnabled: true, revealed: false, },),).toBe(false,);
    expect(shouldBlurNsfw({ blurEnabled: true, revealed: false, },),).toBe(false,);
  });

  test("never blurs when the preference is off (default UX)", () => {
    expect(shouldBlurNsfw({ nsfw: true, blurEnabled: false, revealed: false, },),).toBe(false,);
  });

  test("stops blurring once revealed", () => {
    expect(shouldBlurNsfw({ nsfw: true, blurEnabled: true, revealed: true, },),).toBe(false,);
  });
});
