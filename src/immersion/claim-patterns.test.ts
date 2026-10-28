// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Claim-pattern unit tests (WI-1).
 *
 * Each closed pattern matches its documented first-person shapes and
 * rejects non-claims; the aggregates reference every member pattern so
 * pattern-list changes are caught here, not in production.
 */
import { describe, expect, test, } from "bun:test";

import {
  ACTION_CLAIM,
  ACTION_CLAIM_PATTERNS,
  ITEM_CLAIM_PATTERNS,
  ITEM_CONSUME_CLAIM,
  ITEM_EQUIP_CLAIM,
  ITEM_READ_CLAIM,
  ITEM_USE_CLAIM,
  ITEM_WIELD_ATTACK_CLAIM,
  MOVEMENT_CLAIM,
  MOVEMENT_CLAIM_PATTERNS,
  SKILL_CAST_CLAIM,
  SKILL_CHECK_CLAIM,
  SKILL_CLAIM_PATTERNS,
  SKILL_NAMED_CLAIM,
  SKILL_TRAIT_CLAIM,
  STAGED_ACTION_CLAIM,
  STAGED_MOVEMENT_CLAIM,
} from "./claim-patterns";

/** First capture group of a pattern against text (null when no match). */
function capture(pattern: RegExp, text: string,): string | null {
  pattern.lastIndex = 0;
  return pattern.exec(text,)?.[1] ?? null;
}

describe("MOVEMENT_CLAIM", () => {
  test("matches first-person movement verbs", () => {
    expect(capture(MOVEMENT_CLAIM, "I sprint away from the ropes",),).toBe("sprint",);
    expect(capture(MOVEMENT_CLAIM, "we head north",),).toBe("head",);
    expect(capture(MOVEMENT_CLAIM, "I'm leaving the hall",),).toBe("leaving",);
    expect(capture(MOVEMENT_CLAIM, "we'll escape at dawn",),).toBe("escape",);
  });

  test("rejects third-person and non-movement text", () => {
    expect(MOVEMENT_CLAIM.test("she sprints away",),).toBe(false,);
    expect(MOVEMENT_CLAIM.test("I think about it",),).toBe(false,);
  });
});

describe("STAGED_MOVEMENT_CLAIM", () => {
  test("matches asterisk roleplay movement", () => {
    expect(capture(STAGED_MOVEMENT_CLAIM, "*sprints away from the ropes*",),).toBe("sprint",);
    expect(STAGED_MOVEMENT_CLAIM.test("*waves politely*",),).toBe(false,);
  });
});

describe("skill claims", () => {
  test("SKILL_NAMED_CLAIM matches use/try ... skill", () => {
    expect(capture(SKILL_NAMED_CLAIM, "I use my stealth skill to vanish",),).toBe("stealth",);
    expect(capture(SKILL_NAMED_CLAIM, "trying my acrobatics skill",),).toBe("acrobatics",);
    expect(SKILL_NAMED_CLAIM.test("I admire her skill",),).toBe(false,);
  });

  test("SKILL_CAST_CLAIM matches cast <spell>", () => {
    expect(capture(SKILL_CAST_CLAIM, "I cast fireball at the door",),).toBe("fireball",);
    expect(capture(SKILL_CAST_CLAIM, "we cast healing word",),).toBe("healing",);
  });

  test("SKILL_CHECK_CLAIM matches roll/make a <skill> check", () => {
    expect(capture(SKILL_CHECK_CLAIM, "I roll a perception check",),).toBe("perception",);
    expect(capture(SKILL_CHECK_CLAIM, "we make an investigation roll",),).toBe("investigation",);
  });

  test("SKILL_TRAIT_CLAIM matches with my <skill> training", () => {
    expect(capture(SKILL_TRAIT_CLAIM, "with my athletics training I jump far",),).toBe("athletics",);
    expect(SKILL_TRAIT_CLAIM.test("with my bare hands",),).toBe(false,);
  });
});

describe("item claims", () => {
  test("ITEM_EQUIP_CLAIM matches equip/draw/don", () => {
    expect(capture(ITEM_EQUIP_CLAIM, "I equip the sword",),).toBe("sword",);
    expect(capture(ITEM_EQUIP_CLAIM, "I draw my dagger",),).toBe("dagger",);
  });

  test("ITEM_USE_CLAIM matches use/activate", () => {
    expect(capture(ITEM_USE_CLAIM, "I use my thieves' tools on the lock",),).toBe("thieves' tools",);
    expect(capture(ITEM_USE_CLAIM, "I activate the amulet",),).toBe("amulet",);
  });

  test("ITEM_CONSUME_CLAIM matches drink/eat/quaff", () => {
    expect(capture(ITEM_CONSUME_CLAIM, "I drink the potion",),).toBe("potion",);
    expect(capture(ITEM_CONSUME_CLAIM, "we eat the ration",),).toBe("ration",);
  });

  test("ITEM_WIELD_ATTACK_CLAIM matches attack ... with my <weapon>", () => {
    expect(capture(ITEM_WIELD_ATTACK_CLAIM, "I attack the door with my axe",),).toBe("axe",);
    expect(capture(ITEM_WIELD_ATTACK_CLAIM, "stabbing him with the dagger",),).toBe("dagger",);
  });

  test("ITEM_READ_CLAIM matches read the scroll", () => {
    expect(capture(ITEM_READ_CLAIM, "I read the scroll, then look up",),).toBe("scroll",);
    expect(capture(ITEM_READ_CLAIM, "reading the tome",),).toBe("tome",);
  });
});

describe("ACTION_CLAIM and STAGED_ACTION_CLAIM", () => {
  test("generic action verbs match with and without try-to", () => {
    expect(capture(ACTION_CLAIM, "I try to break the chains",),).toBe("break",);
    expect(capture(ACTION_CLAIM, "I force the door",),).toBe("force",);
    expect(capture(ACTION_CLAIM, "I'm kicking the bars",),).toBe("kicking",);
  });

  test("staged asterisk actions match", () => {
    expect(capture(STAGED_ACTION_CLAIM, "*kicks the door hard*",),).toBe("kick",);
    expect(STAGED_ACTION_CLAIM.test("*smiles weakly*",),).toBe(false,);
  });
});

describe("aggregate pattern lists", () => {
  test("each aggregate references its member patterns", () => {
    expect(MOVEMENT_CLAIM_PATTERNS,).toContain(MOVEMENT_CLAIM,);
    expect(MOVEMENT_CLAIM_PATTERNS,).toContain(STAGED_MOVEMENT_CLAIM,);
    expect(ACTION_CLAIM_PATTERNS,).toContain(ACTION_CLAIM,);
    expect(ACTION_CLAIM_PATTERNS,).toContain(STAGED_ACTION_CLAIM,);
    expect(SKILL_CLAIM_PATTERNS,).toContain(SKILL_NAMED_CLAIM,);
    expect(SKILL_CLAIM_PATTERNS,).toContain(SKILL_CAST_CLAIM,);
    expect(SKILL_CLAIM_PATTERNS,).toContain(SKILL_CHECK_CLAIM,);
    expect(SKILL_CLAIM_PATTERNS,).toContain(SKILL_TRAIT_CLAIM,);
    const itemPatterns = ITEM_CLAIM_PATTERNS.map(([pattern,],) => pattern);
    expect(itemPatterns,).toContain(ITEM_EQUIP_CLAIM,);
    expect(itemPatterns,).toContain(ITEM_USE_CLAIM,);
    expect(itemPatterns,).toContain(ITEM_CONSUME_CLAIM,);
    expect(itemPatterns,).toContain(ITEM_WIELD_ATTACK_CLAIM,);
    expect(itemPatterns,).toContain(ITEM_READ_CLAIM,);
  });

  test("aggregate entries carry an interaction kind", () => {
    const kinds = ITEM_CLAIM_PATTERNS.map(([, kind,],) => kind);
    expect(kinds,).toEqual(["equip", "use", "consume", "wield", "read",],);
  });
});
