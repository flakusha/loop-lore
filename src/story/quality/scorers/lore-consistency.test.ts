// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ScorerContext, } from "../types";
import { scoreLoreConsistency, } from "./lore-consistency";

/**
 * @param response
 * @param lore
 */
function score(response: string, lore: string | null,): number {
  const ctx: ScorerContext = {
    response,
    prompt: "",
    actorName: "Wanderer",
    lore,
    quests: [],
    recentTurns: [],
  };
  return scoreLoreConsistency(ctx,);
}

describe("lore-consistency gaps — reachable behavior", () => {
  test("no lore returns the neutral default", () => {
    expect(score("The knight drew his sword.", null,),).toBe(75,);
  });

  test("unrelated lore returns the base score", () => {
    expect(
      score("The knight drew his sword.", "The kingdom of Aldoria has fallen.",),
    ).toBe(70,);
  });

  test("even exact entity matches score the base (entities never extracted)", () => {
    expect(score("Aldoria has fallen.", "Aldoria has fallen.",),).toBe(70,);
  });

  test("score stays within bounds for long inputs", () => {
    const s = score("word ".repeat(500,), "lore ".repeat(500,),);
    expect(s,).toBeGreaterThanOrEqual(10,);
    expect(s,).toBeLessThanOrEqual(100,);
  });
});
