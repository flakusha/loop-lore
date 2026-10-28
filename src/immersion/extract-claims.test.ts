// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Claim-extraction tests (WI-1).
 *
 * Covers every claim kind, contraction/gerund forms, staged asterisk actions,
 * span-overlap suppression, the per-message cap, and the pipeline size guard.
 */
import { describe, expect, test, } from "bun:test";
import { MAX_INPUT_CHARS, RegexInputTooLargeError, } from "../regex/safe-exec";
import { extractClaims, } from "./extract-claims";

function kindsOf(content: string,): string[] {
  return extractClaims({ content, },).map((claim,) => claim.kind);
}

describe("extractClaims — movement", () => {
  test("I sprint away (AC1 deterministic input)", () => {
    const claims = extractClaims({ content: "I sprint away from the ropes", },);
    expect(claims,).toHaveLength(1,);
    expect(claims[0],).toMatchObject({ kind: "movement", verb: "sprint", },);
    expect(claims[0]?.text,).toBe("I sprint",);
    expect(claims[0]?.matchIndex,).toBe(0,);
  });

  test("contractions, future, plural subjects", () => {
    for (const content of ["I'm leaving this cell", "we'll escape tonight", "We head north",]) {
      expect(kindsOf(content,),).toEqual(["movement",],);
    }
  });

  test("staged asterisk movement", () => {
    const claims = extractClaims({ content: "*sprints toward the door*", },);
    expect(claims[0],).toMatchObject({ kind: "movement", verb: "sprint", },);
  });

  test("non-first-person narration does not claim", () => {
    expect(kindsOf("The guard walks the wall",),).toEqual([],);
  });
});

describe("extractClaims — skill", () => {
  test("named skill", () => {
    const claims = extractClaims({ content: "I use my Acrobatics skill to flip over", },);
    expect(claims[0],).toMatchObject({ kind: "skill", skill: "acrobatics", },);
  });

  test("cast and check forms", () => {
    expect(extractClaims({ content: "I cast Fireball at the wall", },)[0],)
      .toMatchObject({ kind: "skill", skill: "fireball", },);

    expect(extractClaims({ content: "I roll a perception check", },)[0],)
      .toMatchObject({ kind: "skill", skill: "perception", },);
  });

  test("trait phrasing", () => {
    expect(extractClaims({ content: "With my athletics training I clear the gap", },)[0],)
      .toMatchObject({ kind: "skill", skill: "athletics", },);
  });
});

describe("extractClaims — item", () => {
  test("equip / draw / use / consume / read / wield-attack", () => {
    const samples: Array<[string, string, string,]> = [
      ["I equip the sword and shield", "equip", "sword",],
      ["I draw my dagger", "equip", "dagger",],
      ["I use the key on the lock", "use", "key",],
      ["I drink the healing potion", "consume", "healing potion",],
      ["I read the scroll", "read", "scroll",],
      ["I attack him with my axe", "wield", "axe",],
      ["I stab the guard with the dagger", "wield", "dagger",],
    ];

    for (const [content, action, item,] of samples) {
      expect(extractClaims({ content, },)[0],).toMatchObject({ kind: "item", action, item, },);
    }
  });
});

describe("extractClaims — action", () => {
  test("attempted action with try-to", () => {
    expect(extractClaims({ content: "I try to break the chains", },)[0],)
      .toMatchObject({ kind: "action", verb: "break", },);
  });

  test("staged action", () => {
    expect(extractClaims({ content: "*kicks the door*", },)[0],)
      .toMatchObject({ kind: "action", verb: "kick", },);
  });
});

describe("extractClaims — overlap suppression and caps", () => {
  test("skill phrasing wins over the shared use verb", () => {
    const claims = extractClaims({ content: "I use my lockpicking skill", },);
    expect(claims,).toHaveLength(1,);
    expect(claims[0]?.kind,).toBe("skill",);
  });

  test("multiple distinct claims are kept", () => {
    const claims = extractClaims({
      content: "I equip the sword and I sprint away; then I try to break the door",
    },);

    expect(kindsOf("x",),).toEqual([],); // sanity: helper works
    expect(claims.map((c,) => c.kind).sort(),).toEqual(["action", "item", "movement",],);
  });

  test("claim cap bounds extraction", () => {
    const content = Array.from(
      { length: 40, },
      (_, i,) => `I sprint circle ${i} and then rest.`,
    ).join(" ",);

    expect(extractClaims({ content, },).length,).toBeLessThanOrEqual(MAX_INPUT_CHARS,);
    expect(extractClaims({ content, },).length,).toBeGreaterThan(0,);
    expect(extractClaims({ content, },).length,).toBeLessThan(40,);
  });

  test("oversized input throws the typed error", () => {
    expect(() => extractClaims({ content: "x".repeat(MAX_INPUT_CHARS + 1,), },))
      .toThrow(RegexInputTooLargeError,);
  });

  test("empty message yields no claims", () => {
    expect(extractClaims({ content: "", },),).toEqual([],);
  });
});
