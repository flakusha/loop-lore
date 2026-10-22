// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import {
  detectOutfitEvent,
  OUTFIT_EQUIP,
  OUTFIT_EQUIP_CONFIDENCE,
  OUTFIT_PATTERNS,
  OUTFIT_REMOVE,
  OUTFIT_REMOVE_CONFIDENCE,
} from "./outfit-events";

describe("outfit-events regex prefilter", () => {
  describe("OUTFIT_EQUIP", () => {
    it.each([
      ["he donned his armour.", "armour",],
      ["she was wearing a travel cloak.", "travel cloak",],
      ["Mira slipped into her evening gown.", "evening gown",],
    ],)("matches %s → captures %s", (input, expected,) => {
      expect(OUTFIT_EQUIP.exec(input,)?.[1],).toBe(expected,);
    },);
  });

  describe("OUTFIT_REMOVE", () => {
    it.each([
      ["Mira shed her cloak.", "cloak",],
      ["Rin discarded the borrowed coat.", "borrowed coat",],
      ["he took off his boots.", "boots",],
    ],)("matches %s → captures %s", (input, expected,) => {
      expect(OUTFIT_REMOVE.exec(input,)?.[1],).toBe(expected,);
    },);
  });

  describe("imperative commands do not match", () => {
    it.each([
      "put on the blue dress",
      "wear armor",
      "change your outfit",
    ],)("does not match %s", (input,) => {
      expect(detectOutfitEvent(input,).hit,).toBe(false,);
    },);
  });

  describe("closed garment vocabulary", () => {
    it("does not match a non-garment capture", () => {
      expect(detectOutfitEvent("he donned his bicycle.",).hit,).toBe(false,);
      expect(detectOutfitEvent("she shed her doubts.",).hit,).toBe(false,);
    });
  });

  describe("detectOutfitEvent contract", () => {
    it("equip hit carries distinct confidence", () => {
      const r = detectOutfitEvent("he donned his armour.",);
      expect(r,).toEqual({ hit: true, confidence: OUTFIT_EQUIP_CONFIDENCE, kind: "equip", garment: "armour", },);
    });

    it("remove hit carries distinct confidence", () => {
      const r = detectOutfitEvent("Mira shed her cloak.",);
      expect(r,).toEqual({ hit: true, confidence: OUTFIT_REMOVE_CONFIDENCE, kind: "remove", garment: "cloak", },);
    });

    it("confidences are distinct from each other and from image-edit 0.9/0.7", () => {
      expect(OUTFIT_EQUIP_CONFIDENCE,).not.toBe(OUTFIT_REMOVE_CONFIDENCE,);
      for (const c of [OUTFIT_EQUIP_CONFIDENCE, OUTFIT_REMOVE_CONFIDENCE,]) {
        expect(c,).not.toBe(0.9,);
        expect(c,).not.toBe(0.7,);
      }
    });

    it("miss returns the same shape as a hit (caller's don't-run signal)", () => {
      const r = detectOutfitEvent("The weather is nice today.",);
      expect(r,).toEqual({ hit: false, confidence: 0, kind: null, garment: null, },);
      expect(Object.keys(r,).sort(),).toEqual(["confidence", "garment", "hit", "kind",],);
    });

    it("never throws on hostile input and completes promptly", () => {
      const t0 = Date.now();
      const r = detectOutfitEvent(`${"cloak ".repeat(5000,)}!${"x".repeat(5000,)}`,);
      expect(Date.now() - t0,).toBeLessThan(1000,);
      expect(r.hit,).toBe(false,);
    });

    it("module is tier-agnostic (no tier/model-role wiring)", async () => {
      const src = await Bun.file(new URL("./outfit-events.ts", import.meta.url,),).text();
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "",).replace(/\/\/[^\n]*/g, "",);
      expect(code,).not.toMatch(/ModelRole|classifier|config\.hooks|\btier\b/i,);
    });

    it("has no production caller yet (leaf module)", async () => {
      const src = await Bun.file(new URL("./outfit-events.ts", import.meta.url,),).text();
      expect(src,).not.toMatch(/from "\.\.\/image-edit\//,);
    });

    it("exposes both groups", () => {
      expect(OUTFIT_PATTERNS.length,).toBe(2,);
    });
  });
});
