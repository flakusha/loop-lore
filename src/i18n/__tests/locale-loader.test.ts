/**
 * Locale Loader Tests
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import {
  clearLocaleCache,
  getRawTranslations,
  loadLocale,
  loadLocaleSync,
} from "../locale-loader";
import type { Locale, } from "../types";

describe("locale-loader", () => {
  beforeEach(() => {
    clearLocaleCache();
  },);

  describe("loadLocale", () => {
    it("loads valid locale and returns flattened translations", () => {
      const flat = loadLocale("en",);
      expect(flat,).toBeInstanceOf(Map,);
      // English locale should have some keys
      expect(flat.size,).toBeGreaterThan(0,);
    });

    it("caches locale after first load", () => {
      const first = loadLocale("en",);
      const second = loadLocale("en",);
      expect(first,).toBe(second,); // Same reference
    });

    it("returns empty map for invalid locale", () => {
      const flat = loadLocale("xx" as Locale,);
      expect(flat,).toBeInstanceOf(Map,);
      expect(flat.size,).toBe(0,);
    });

    it("loadLocaleSync returns same result as loadLocale", () => {
      const asyncResult = loadLocale("en",);
      clearLocaleCache();
      const syncResult = loadLocaleSync("en",);
      expect(syncResult.size,).toBe(asyncResult.size,);
    });
  });

  describe("getRawTranslations", () => {
    it("returns raw nested translations", () => {
      const raw = getRawTranslations("en",);
      expect(raw,).toBeDefined();
      expect(typeof raw,).toBe("object",);
    });

    it("loads locale if not cached", () => {
      clearLocaleCache();
      const raw = getRawTranslations("en",);
      expect(raw,).toBeDefined();
    });

    it("returns undefined for invalid locale", () => {
      const raw = getRawTranslations("xx" as Locale,);
      expect(raw,).toBeUndefined();
    });
  });

  describe("clearLocaleCache", () => {
    it("clears all caches", () => {
      loadLocale("en",);
      clearLocaleCache();
      // After clearing, should load fresh
      const fresh = loadLocale("en",);
      expect(fresh,).toBeInstanceOf(Map,);
    });
  });
});
