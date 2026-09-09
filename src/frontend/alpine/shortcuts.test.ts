// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { DEFAULT_KEYMAP, dispatchKeynavAction, getKeymap, isKeyboardNavEnabled, } from "./shortcuts";

describe("shortcuts.ts", () => {
  describe("DEFAULT_KEYMAP", () => {
    it("contains all expected shortcut entries", () => {
      const combos = DEFAULT_KEYMAP.map((k,) => k.combo);
      expect(combos,).toContain("?",);
      expect(combos,).toContain("g g",);
      expect(combos,).toContain("g p",);
      expect(combos,).toContain("g c",);
      expect(combos,).toContain("g s",);
      expect(combos,).toContain("g a",);
      expect(combos,).toContain("g h",);
      expect(combos,).toContain("[",);
      expect(combos,).toContain("]",);
      expect(combos,).toContain("j",);
      expect(combos,).toContain("k",);
    });

    it("every entry has a non-empty action", () => {
      for (const entry of DEFAULT_KEYMAP) {
        expect(entry.action.length,).toBeGreaterThan(0,);
      }
    });

    it("ignoreInInput is true for j/k/[/] but false for g-prefixed combos", () => {
      const chatOnly = DEFAULT_KEYMAP.filter((k,) => k.ignoreInInput === true);
      const chatCombos = chatOnly.map((k,) => k.combo);
      expect(chatCombos,).toContain("j",);
      expect(chatCombos,).toContain("k",);
      expect(chatCombos,).toContain("[",);
      expect(chatCombos,).toContain("]",);

      const navEntries = DEFAULT_KEYMAP.filter((k,) => k.combo.startsWith("g ",));
      for (const entry of navEntries) {
        expect(entry.ignoreInInput,).not.toBe(true,);
      }
    });
  });

  describe("getKeymap()", () => {
    it("returns the DEFAULT_KEYMAP", () => {
      const km = getKeymap();
      expect(km,).toEqual(DEFAULT_KEYMAP,);
    });

    it("returns a new array each call (not the same reference)", () => {
      const km1 = getKeymap();
      const km2 = getKeymap();
      expect(km1,).not.toBe(km2,);
    });
  });

  describe("isKeyboardNavEnabled()", () => {
    it("returns a boolean without throwing when Alpine is absent", () => {
      const result = isKeyboardNavEnabled();
      expect(typeof result,).toBe("boolean",);
    });
  });

  // dispatchKeynavAction requires window — only run in DOM environment
  if (typeof window !== "undefined") {
    describe("dispatchKeynavAction()", () => {
      it("dispatches a CustomEvent with the action in detail", () => {
        const received = { detail: null as unknown, };
        const listener = (e: Event,) => {
          received.detail = (e as CustomEvent).detail;
        };
        window.addEventListener("keynav:action", listener,);
        dispatchKeynavAction("goto-chatlist",);
        expect(received.detail,).toEqual({ action: "goto-chatlist", },);
        window.removeEventListener("keynav:action", listener,);
      });

      it("event bubbles", () => {
        const received = { bubbles: null as unknown, };
        const listener = (e: Event,) => {
          received.bubbles = (e as CustomEvent).bubbles;
        };
        window.addEventListener("keynav:action", listener,);
        dispatchKeynavAction("toggle-help",);
        expect(received.bubbles,).toBe(true,);
        window.removeEventListener("keynav:action", listener,);
      });
    });
  }
});
