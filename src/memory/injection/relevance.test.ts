// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { MemoryEntry, } from "../types";
import { isContextRelevant, } from "./relevance";
import type { InjectionContext, } from "./types";

/**
 * @param keywords
 * @param currentKeywords
 */
function check(keywords: string[], currentKeywords: string[],): boolean {
  const memory = { keywords, } as MemoryEntry;
  const ctx = { currentKeywords, } as InjectionContext;
  return isContextRelevant(memory, ctx,);
}

describe("relevance gaps — isContextRelevant", () => {
  test("empty current keywords are never relevant", () => {
    expect(check(["dragon", "castle",], [],),).toBe(false,);
  });

  test("empty memory keywords are never relevant", () => {
    expect(check([], ["dragon",],),).toBe(false,);
  });

  test("two overlapping keywords are relevant", () => {
    expect(check(["dragon", "castle", "sword",], ["dragon", "castle", "quest",],),).toBe(true,);
  });

  test("matching is case-insensitive", () => {
    expect(check(["Dragon",], ["dragon", "castle", "quest", "tavern", "kings",],),).toBe(true,);
  });

  test("single overlap at twenty percent is relevant", () => {
    expect(
      check(["dragon", "a", "b", "c", "d",], ["dragon", "zzz",],),
    ).toBe(true,);
  });

  test("single overlap below twenty percent is not relevant", () => {
    const memory = ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "dragon",];
    expect(check(memory, ["dragon", "zzz",],),).toBe(false,);
  });

  test("no overlap is not relevant", () => {
    expect(check(["dragon", "castle",], ["fishing", "boats",],),).toBe(false,);
  });
});
