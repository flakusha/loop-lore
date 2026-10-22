// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for `resolveVariantOverrides` — the trust boundary between a
 * caller-supplied `variant` and the canonical taxonomy table.
 *
 * Two contracts are pinned here. An absent key falls back to the variant
 * default, while an explicit `null` means "no value" and must survive the
 * round trip. And only an *explicit* caller component is validated against the
 * table — a chat setup template's preset mode never conflicts with a variant.
 */
import { describe, expect, test, } from "bun:test";
import type { ChatCreateBody, } from "../../validation/schemas";
import { resolveVariantOverrides, } from "./create-variant";

/**
 * Resolve the overrides for a raw request body.
 * @param rawBody
 */
function resolve(rawBody: Record<string, unknown>,) {
  const body = rawBody as unknown as typeof ChatCreateBody.static;
  return resolveVariantOverrides(rawBody, body, (key: string,) => key in rawBody,);
}

describe("resolveVariantOverrides", () => {
  test("a body without a variant resolves to nothing", () => {
    expect(resolve({ name: "plain", },),).toEqual({},);
  });

  test("an unknown variant is rejected", () => {
    expect(resolve({ variant: "nope", },).error,).toContain("Unknown chat variant",);
  });

  test("absent keys fall back to the variant defaults", () => {
    const out = resolve({ variant: "llm_only", },);
    expect(out.error,).toBeUndefined();
    expect(out.resolvedMaxTurns,).toBe(50,);
    expect(out.resolvedAutoAdvance,).toBe(1,);
    expect(out.resolvedTalkativity,).toBe(8,);
  });

  test("an explicit null survives instead of falling back to the default", () => {
    const out = resolve({
      variant: "llm_only",
      maxTurns: null,
      autoAdvance: null,
      talkativity: null,
      promptOverride: null,
    },);

    expect(out.error,).toBeUndefined();
    expect(out.resolvedMaxTurns,).toBeNull();
    expect(out.resolvedAutoAdvance,).toBeNull();
    expect(out.resolvedTalkativity,).toBeNull();
    expect(out.resolvedPromptOverride,).toBeNull();
  });

  test("an explicit value wins over the variant default", () => {
    const out = resolve({ variant: "llm_only", maxTurns: 7, talkativity: 3, },);
    expect(out.resolvedMaxTurns,).toBe(7,);
    expect(out.resolvedTalkativity,).toBe(3,);
  });

  test("the llm-only variants carry a non-empty test prompt", () => {
    expect(resolve({ variant: "llm_only", },).resolvedPromptOverride,).toBeTruthy();
    expect(resolve({ variant: "llm_only_group", },).resolvedPromptOverride,).toBeTruthy();
  });

  test("an explicit component that disagrees with the variant is rejected", () => {
    expect(resolve({ variant: "rpg", mode: "battle", },).error,).toContain("rpg",);
  });

  test("an explicit component that agrees with the variant is accepted", () => {
    const out = resolve({ variant: "rpg", mode: "story", purpose: "rpg", },);
    expect(out.error,).toBeUndefined();
    expect(out.resolvedMode,).toBe("story",);
    expect(out.resolvedPurpose,).toBe("rpg",);
  });
});
