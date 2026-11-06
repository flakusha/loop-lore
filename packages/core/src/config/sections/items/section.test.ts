// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// packages/core/src/config/sections/items/section.test.ts — items section schema validation

import { describe, expect, test, } from "bun:test";
import { ITEMS_DEFAULTS, } from "./defaults";
import { itemsMeta, ItemsSection, } from "./section";

const CATEGORIES = itemsMeta.properties.templates.items.properties.category.enum as string[];
const RARITIES = itemsMeta.properties.templates.items.properties.rarity.enum as string[];

/** Type-guard: is every value in list a member of the meta enum */
const validEnum = (values: unknown[], enumList: string[],): boolean =>
  values.every((v,) => typeof v === "string" && enumList.includes(v,));

describe("itemsMeta", () => {
  test("declares enabled + templates as required object properties", () => {
    expect(itemsMeta.type,).toBe("object",);
    expect(itemsMeta.required,).toEqual(["enabled", "templates",],);
    expect(itemsMeta.properties.templates.type,).toBe("array",);
    expect(itemsMeta.properties.templates.items.required,).toEqual(["name", "category",],);
  });

  test("category enum matches the unified item taxonomy", () => {
    expect(CATEGORIES,).toContain("weapon",);
    expect(CATEGORIES,).toContain("armor",);
    expect(CATEGORIES,).toContain("consumable",);
    expect(CATEGORIES,).toContain("tool",);
    expect(CATEGORIES,).toContain("treasure",);
  });

  test("defaults satisfy the published schema", () => {
    expect(ITEMS_DEFAULTS.enabled,).toBe(true,);
    for (const template of ITEMS_DEFAULTS.templates) {
      expect(typeof template.name,).toBe("string",);
      expect((template.name as string).length,).toBeGreaterThan(0,);
      expect(CATEGORIES,).toContain(template.category,);
      if (template.rarity !== undefined) {
        expect(RARITIES,).toContain(template.rarity,);
      }
    }
    // Required template keys present on every default
    const requiredKeys = itemsMeta.properties.templates.items.required as string[];
    for (const template of ITEMS_DEFAULTS.templates) {
      for (const key of requiredKeys) {
        expect(template[key as keyof typeof template],).toBeDefined();
      }
    }
  });

  test("default templates cover the major categories", () => {
    const used = new Set(ITEMS_DEFAULTS.templates.map((t,) => t.category),);
    for (const major of ["weapon", "armor", "consumable", "tool", "treasure",]) {
      expect(used.has(major as never,),).toBe(true,);
    }
  });

  test("enum guards behave", () => {
    expect(validEnum(["weapon",], CATEGORIES,),).toBe(true,);
    expect(validEnum(["nonexistent",], CATEGORIES,),).toBe(false,);
    expect(validEnum(["common", "rare",], RARITIES,),).toBe(true,);
  });
});

describe("ItemsSection", () => {
  test("defaults carry the built-in starter templates", () => {
    const section = new ItemsSection();
    expect(section.enabled,).toBe(true,);
    expect(section.templates.length,).toBeGreaterThanOrEqual(6,);
  });

  test("overrides replace defaults", () => {
    const section = new ItemsSection({ enabled: false, templates: [], },);
    expect(section.enabled,).toBe(false,);
    expect(section.templates,).toEqual([],);
  });
});
