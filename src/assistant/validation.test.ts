// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for lightweight generated-entity validation.
 *
 * All kinds require non-empty name + description; character and world add
 * one recommended field each. Missing recommended fields fail validation.
 */
import { describe, expect, test, } from "bun:test";
import { validateGeneratedEntity, } from "./validation";

describe("validateGeneratedEntity", () => {
  test("valid character passes with no errors", () => {
    const r = validateGeneratedEntity(
      { name: "Kaelen", description: "A bold knight.", personality: "Brave.", },
      "character",
    );
    expect(r,).toEqual({ valid: true, errors: [], },);
  });

  test("valid world and item pass", () => {
    expect(
      validateGeneratedEntity({ name: "W", description: "D.", lore: "Old.", }, "world",).valid,
    ).toBe(true,);
    expect(
      validateGeneratedEntity({ name: "I", description: "D.", }, "item",).valid,
    ).toBe(true,);
  });

  test("null data fails with a single error", () => {
    const r = validateGeneratedEntity(null as unknown as Record<string, unknown>, "item",);
    expect(r.valid,).toBe(false,);
    expect(r.errors.length,).toBe(1,);
  });

  test("missing name and description report both", () => {
    const r = validateGeneratedEntity({ name: "  ", }, "location",);
    expect(r.valid,).toBe(false,);
    expect(r.errors.length,).toBe(2,);
  });

  test("character without personality fails", () => {
    const r = validateGeneratedEntity({ name: "N", description: "D.", }, "character",);
    expect(r.valid,).toBe(false,);
    expect(r.errors.join(" ",),).toMatch(/personality/,);
  });

  test("world without lore fails, item without lore passes", () => {
    const world = validateGeneratedEntity({ name: "N", description: "D.", }, "world",);
    expect(world.valid,).toBe(false,);
    expect(world.errors.join(" ",),).toMatch(/lore/,);
    expect(
      validateGeneratedEntity({ name: "N", description: "D.", }, "item",).valid,
    ).toBe(true,);
  });
});
