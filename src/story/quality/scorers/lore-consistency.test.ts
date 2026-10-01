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

  // The scorer used to lowercase its input before extractEntities, whose
  // pattern only matches capitalized words. Both sets came back empty and
  // every non-null lore scored exactly 70, so these three branches never
  // ran. BUG-lore-consistency-scorer-entity-matching-branch-unreachable-d.

  test("entities echoed from lore earn the full match bonus (70 + 15)", () => {
    expect(score("Aldoria has fallen.", "Aldoria has fallen.",),).toBe(85,);
  });

  // Note on the fixtures below: extractEntities chains ADJACENT capitalized
  // words into one entity, and only the first word of a sentence is
  // capitalized. The inputs are therefore short sentence fragments with a
  // trailing period between each word, which is what makes them extract as
  // four distinct entities rather than one chained run.

  test("a 1-in-4 entity overlap earns the partial bonus (70 + 8)", () => {
    // Response: knight, sword, aldoria, thorn (4). Lore holds aldoria only
    // among those, so matchCount is 1 and the ratio is 0.25 — above the 0.2
    // floor, at the boundary below the 0.5 full-bonus threshold.
    expect(
      score("Knight. Sword. Aldoria. Thorn.", "Aldoria. Castle. Kingdom. Fallen.",),
    ).toBe(78,);
  });

  test("no response entities in lore are penalised (70 - 15)", () => {
    expect(
      score("Gnarled. Jittering. Twitching. Flickering.", "Aldoria. Castle. Kingdom. Fallen.",),
    ).toBe(55,);
  });

  test("score stays within bounds for long inputs", () => {
    const s = score("word ".repeat(500,), "lore ".repeat(500,),);
    expect(s,).toBeGreaterThanOrEqual(10,);
    expect(s,).toBeLessThanOrEqual(100,);
  });
});

describe("lore-consistency — falsy and empty lore boundaries", () => {
  test("empty lore string is falsy → neutral default 75", () => {
    expect(score("The knight drew his sword.", "",),).toBe(75,);
  });

  test("empty response with non-empty lore → base 70", () => {
    expect(score("", "The kingdom of Aldoria has fallen.",),).toBe(70,);
  });

  test("both empty → lore falsy wins → 75", () => {
    expect(score("", "",),).toBe(75,);
  });

  test("whitespace-only lore is truthy → base 70", () => {
    expect(score("The knight drew his sword.", "   ",),).toBe(70,);
  });

  test("newline/tab-only lore is truthy → base 70", () => {
    expect(score("The knight drew his sword.", "\n\t",),).toBe(70,);
  });
});

describe("lore-consistency — entity extraction is dead (input pre-lowercased)", () => {
  test("lore with only stopwords → base 70", () => {
    expect(score("The knight drew his sword.", "The A An This That It He She They We You I",),).toBe(70,);
  });

  test("response with capitalized names, lore without → still base 70", () => {
    expect(score("Aldoria and Brennus march north.", "the kingdom has fallen.",),).toBe(70,);
  });

  test("unicode lore and response → base 70, no crash", () => {
    expect(
      score("Der Ritter zog sein Schwert aus der Scheide.", "Das Königreich Aldoria ist gefallen.",),
    ).toBe(70,);
  });

  test("mixed-case lore with digits and punctuation → base 70", () => {
    expect(score("He draws the sword.", "Aldoria-7 (the Fallen Kingdom) has FALLEN!",),).toBe(70,);
  });

  test("single-character lore → base 70", () => {
    expect(score("He draws the sword.", "x",),).toBe(70,);
  });

  test("lore that is only punctuation → base 70", () => {
    expect(score("He draws his sword.", "!!! ... ???",),).toBe(70,);
  });
});

describe("lore-consistency — clamp and determinism", () => {
  test("score is deterministic across repeated calls", () => {
    const a = score("The knight drew his sword.", "The kingdom of Aldoria has fallen.",);
    const b = score("The knight drew his sword.", "The kingdom of Aldoria has fallen.",);
    expect(a,).toBe(b,);
  });

  test("null lore always yields exactly 75 regardless of response", () => {
    expect(score("", null,),).toBe(75,);
    expect(score("word ".repeat(1000,), null,),).toBe(75,);
  });
});
