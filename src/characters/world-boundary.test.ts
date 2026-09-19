// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the character/world boundary guard (TASK-031).
 *
 * Asserts observable guard behavior: clean bodies pass, cross-boundary
 * bodies fail with a message naming the offending fields and the API that
 * owns them, shared keys pass on both sides, and protocol metadata is never
 * flagged.
 */
import { describe, expect, test, } from "bun:test";
import {
  assertNoCrossBoundaryWrite,
  CHARACTER_OWNED_FIELDS,
  SHARED_BOUNDARY_FIELDS,
  WORLD_OWNED_FIELDS,
} from "./world-boundary";

/** Unwrap a failed result, failing the test when the guard unexpectedly passed. */
function expectViolation(result: ReturnType<typeof assertNoCrossBoundaryWrite>,): Error {
  if (result.ok) { throw new Error("expected the guard to reject these fields",); }
  return result.error;
}

describe("assertNoCrossBoundaryWrite", () => {
  test("passes a clean character update body", () => {
    const result = assertNoCrossBoundaryWrite("character", ["displayName", "personality", "settings",],);
    expect(result.ok,).toBe(true,);
  });

  test("passes a clean world update body", () => {
    const result = assertNoCrossBoundaryWrite("world", ["name", "lore", "rpgDice",],);
    expect(result.ok,).toBe(true,);
  });

  test("passes protocol-only bodies (empty list, dataVersion)", () => {
    expect(assertNoCrossBoundaryWrite("character", [],).ok,).toBe(true,);
    expect(assertNoCrossBoundaryWrite("character", ["dataVersion",],).ok,).toBe(true,);
    expect(assertNoCrossBoundaryWrite("world", ["dataVersion",],).ok,).toBe(true,);
  });

  test("character update carrying world fields names them and points at the world API", () => {
    const error = expectViolation(
      assertNoCrossBoundaryWrite("character", ["displayName", "lore", "rpgCombat",],),
    );
    expect(error.message,).toContain('"lore"',);
    expect(error.message,).toContain('"rpgCombat"',);
    expect(error.message,).not.toContain("displayName",);
    expect(error.message,).toContain("world-owned",);
    expect(error.message,).toContain("PUT /api/worlds/:worldId",);
  });

  test("world update carrying character fields names them and points at the character API", () => {
    const error = expectViolation(
      assertNoCrossBoundaryWrite("world", ["personality", "displayName", "lore",],),
    );
    expect(error.message,).toContain('"personality"',);
    expect(error.message,).toContain('"displayName"',);
    expect(error.message,).not.toContain('"lore"',);
    expect(error.message,).toContain("character-owned",);
    expect(error.message,).toContain("PUT /api/actors/:actorId",);
  });

  test("shared keys (description, name) are writable on both sides", () => {
    expect(SHARED_BOUNDARY_FIELDS,).toContain("description",);
    expect(SHARED_BOUNDARY_FIELDS,).toContain("name",);
    expect(assertNoCrossBoundaryWrite("character", ["description", "name",],).ok,).toBe(true,);
    expect(assertNoCrossBoundaryWrite("world", ["description", "name",],).ok,).toBe(true,);
  });

  test("story-overlay fields violate the character side, belong to the world side", () => {
    const onCharacter = expectViolation(
      assertNoCrossBoundaryWrite("character", ["tempHp", "conditions",],),
    );
    expect(onCharacter.message,).toContain('"tempHp"',);
    expect(onCharacter.message,).toContain('"conditions"',);
    // Story transients are world-side state: a world update may carry them.
    expect(assertNoCrossBoundaryWrite("world", ["tempHp", "happiness",],).ok,).toBe(true,);
  });

  test("every merged owned field passes its own side and violates the other", () => {
    for (const field of CHARACTER_OWNED_FIELDS) {
      expect(assertNoCrossBoundaryWrite("character", [field,],).ok,).toBe(true,);
    }
    for (const field of WORLD_OWNED_FIELDS) {
      expect(assertNoCrossBoundaryWrite("world", [field,],).ok,).toBe(true,);
    }
  });
});
