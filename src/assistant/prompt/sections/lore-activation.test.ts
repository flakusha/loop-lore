// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract tests for the pure lore selective-activation rules.
 *
 * Resource contract: the rules under test are pure, so the tests own no
 * database, file or port. The only global they touch is `Math.random`
 * (the chance gate reads it); it is restored in `afterEach`, so the tests
 * stay independent of each other and of their order.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  type ActivationEntry,
  admitExclusiveGroups,
  clampScanDepth,
  type InclusionGroupCandidate,
  isCooldownExpired,
  matchSelectiveKeys,
  MAX_SCAN_DEPTH,
  passesActivationChance,
} from "./lore-activation";

const originalRandom = Math.random;

function entry(overrides: Partial<ActivationEntry> = {},): ActivationEntry {
  return { keys: null, key_type: null, key_groups: null, scan_depth: null, activation_chance: null, ...overrides, };
}

/** Boolean view of the matcher — the activation gate only needs "did it match". */
function matches(e: ActivationEntry, words: ReadonlySet<string>, text: string,): boolean {
  return matchSelectiveKeys(e, words, text,).active;
}

afterEach(() => {
  // passesActivationChance reads Math.random; restore any per-test stub.
  Math.random = originalRandom;
},);

describe("MAX_SCAN_DEPTH", () => {
  test("is 10 recent messages", () => {
    expect(MAX_SCAN_DEPTH,).toBe(10,);
  });
});

describe("clampScanDepth", () => {
  test("null and non-positive depths collapse to 1", () => {
    expect(clampScanDepth(null,),).toBe(1,);
    expect(clampScanDepth(0,),).toBe(1,);
    expect(clampScanDepth(-3,),).toBe(1,);
  });

  test("values inside the range pass through", () => {
    expect(clampScanDepth(1,),).toBe(1,);
    expect(clampScanDepth(7,),).toBe(7,);
  });

  test("values above the max are clamped to MAX_SCAN_DEPTH", () => {
    expect(clampScanDepth(11,),).toBe(MAX_SCAN_DEPTH,);
    expect(clampScanDepth(1000,),).toBe(MAX_SCAN_DEPTH,);
  });
});

describe("matchSelectiveKeys", () => {
  const words = new Set(["dragon", "hoard",],);

  test("empty activation condition is always active", () => {
    expect(matches(entry(), words, "no keys at all",),).toBe(true,);
  });

  test("regex keys match case-insensitively against the raw text", () => {
    expect(
      matches(
        entry({ key_type: "regex", keys: JSON.stringify(["wyvern", "dragon",],), },),
        words,
        "the DRAGON sleeps",
      ),
    ).toBe(true,);

    expect(
      matches(
        entry({ key_type: "regex", keys: JSON.stringify(["wyvern",],), },),
        words,
        "the dragon sleeps",
      ),
    ).toBe(false,);
  });

  test("regex keys with empty list are always active", () => {
    expect(matches(entry({ key_type: "regex", keys: JSON.stringify([],), },), words, "anything",),).toBe(
      true,
    );
  });

  test("unsafe catastrophic regex is treated as no-match, never a crash", () => {
    expect(
      matches(
        entry({ key_type: "regex", keys: JSON.stringify(["(a+)+$",],), },),
        words,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(false,);
  });

  test("key groups require every keyword of at least one AND group", () => {
    const groups = JSON.stringify([["dragon", "hoard",], ["elf",],],);
    expect(matches(entry({ key_groups: groups, },), words, "",),).toBe(true,);
    expect(matches(entry({ key_groups: JSON.stringify([["dragon", "sword",],],), },), words, "",),).toBe(
      false,
    );
  });

  test("malformed key groups fall back to plain keyword matching", () => {
    // "groups" is a flat array of strings, not a nest of arrays -> null.
    expect(
      matches(
        entry({ key_groups: JSON.stringify(["dragon",],), keys: JSON.stringify(["hoard",],), },),
        words,
        "",
      ),
    ).toBe(true,);
  });

  test("plain keywords match against the lowercased word set", () => {
    expect(matches(entry({ keys: JSON.stringify(["Dragon",],), },), words, "",),).toBe(true,);
    expect(matches(entry({ keys: JSON.stringify(["goblin",],), },), words, "",),).toBe(false,);
  });

  test("plain keyword fallback also accepts comma-separated strings", () => {
    expect(matches(entry({ keys: "goblin, HOARD", },), words, "",),).toBe(true,);
  });

  test("non-empty plain keyword list with no hits is inactive", () => {
    expect(matches(entry({ keys: JSON.stringify(["orc", "troll",],), },), words, "dragon hoard",),).toBe(
      false,
    );
  });
});

describe("matchSelectiveKeys — matched-key count", () => {
  const words = new Set(["dragon", "hoard",],);

  test("plain keys count the keywords present in the window", () => {
    const result = matchSelectiveKeys(entry({ keys: JSON.stringify(["dragon", "hoard",],), },), words, "",);
    expect(result.active,).toBe(true,);
    expect(result.matched,).toBe(2,);
  });

  test("only the present plain keywords are counted", () => {
    const result = matchSelectiveKeys(entry({ keys: JSON.stringify(["dragon", "orc",],), },), words, "",);
    expect(result.active,).toBe(true,);
    expect(result.matched,).toBe(1,);
  });

  test("regex keys count the matching patterns", () => {
    const result = matchSelectiveKeys(
      entry({ key_type: "regex", keys: JSON.stringify(["dragon", "wyvern",],), },),
      words,
      "the dragon sleeps",
    );

    expect(result.active,).toBe(true,);
    expect(result.matched,).toBe(1,);
  });

  test("key groups count the keys of the largest satisfied group", () => {
    const result = matchSelectiveKeys(
      entry({ key_groups: JSON.stringify([["dragon", "hoard",], ["elf",],],), },),
      words,
      "",
    );

    expect(result.active,).toBe(true,);
    expect(result.matched,).toBe(2,);
  });

  test("an entry without an activation condition matches nothing", () => {
    const result = matchSelectiveKeys(entry(), words, "",);
    expect(result.active,).toBe(true,);
    expect(result.matched,).toBe(0,);
  });
});

describe("admitExclusiveGroups", () => {
  /** Build a group candidate with sane defaults. */
  function candidate(overrides: Partial<InclusionGroupCandidate> & { id: string },): InclusionGroupCandidate {
    return {
      inclusion_group: null,
      matched_keys: 0,
      priority: 0,
      insertion_order: 0,
      ...overrides,
    };
  }

  test("exactly one of N mutually exclusive entries fires", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 1, },),
      candidate({ id: "b", inclusion_group: "rumors", matched_keys: 3, },),
      candidate({ id: "c", inclusion_group: "rumors", matched_keys: 2, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["b",],);
    expect(result.decisions,).toEqual([
      { group: "rumors", winner_id: "b", skipped_ids: ["a", "c",], },
    ],);
  });

  test("entries without a group are unaffected", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", },),
      candidate({ id: "b", },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["a", "b",],);
    expect(result.decisions,).toEqual([],);
  });

  test("a blank group is treated as no group", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "", },),
      candidate({ id: "b", inclusion_group: "   ", },),
      candidate({ id: "c", inclusion_group: null, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["a", "b", "c",],);
    expect(result.decisions,).toEqual([],);
  });

  test("a single-entry group fires", () => {
    const result = admitExclusiveGroups([candidate({ id: "a", inclusion_group: "rumors", },),],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["a",],);
  });

  test("a tie on matched keys goes to the higher priority", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 2, priority: 1, },),
      candidate({ id: "b", inclusion_group: "rumors", matched_keys: 2, priority: 5, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["b",],);
  });

  test("a tie on priority goes to the lower insertion order", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 2, insertion_order: 7, },),
      candidate({ id: "b", inclusion_group: "rumors", matched_keys: 2, insertion_order: 3, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["b",],);
  });

  test("a full tie keeps the first candidate", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 2, },),
      candidate({ id: "b", inclusion_group: "rumors", matched_keys: 2, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["a",],);
  });

  test("group names are trimmed, so whitespace variants share a group", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 1, },),
      candidate({ id: "b", inclusion_group: "  rumors  ", matched_keys: 2, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["b",],);
    expect(result.decisions[0]?.group,).toBe("rumors",);
  });

  test("separate groups do not compete with each other", () => {
    const result = admitExclusiveGroups([
      candidate({ id: "a", inclusion_group: "rumors", matched_keys: 1, },),
      candidate({ id: "b", inclusion_group: "props", matched_keys: 2, },),
    ],);

    expect(result.admitted.map((c,) => c.id),).toEqual(["a", "b",],);
    expect(result.decisions.length,).toBe(2,);
  });
});

describe("passesActivationChance", () => {
  test("null chance always passes", () => {
    Math.random = () => 0.999999;
    expect(passesActivationChance(null,),).toBe(true,);
  });

  test("chance 1 always passes, chance 0 never passes", () => {
    Math.random = () => 0.0;
    expect(passesActivationChance(1,),).toBe(true,);
    Math.random = () => 0.999999;
    expect(passesActivationChance(0,),).toBe(false,);
  });

  test("out-of-range chances are clamped into [0, 1]", () => {
    Math.random = () => 0.5;
    expect(passesActivationChance(5,),).toBe(true,);
    expect(passesActivationChance(-5,),).toBe(false,);
  });
});

describe("isCooldownExpired", () => {
  test("non-positive cooldown is always eligible", () => {
    expect(isCooldownExpired(new Date().toISOString(), 0,),).toBe(true,);
    expect(isCooldownExpired(new Date().toISOString(), -1,),).toBe(true,);
  });

  test("missing or unparseable last_activated is always eligible", () => {
    expect(isCooldownExpired(null, 60,),).toBe(true,);
    expect(isCooldownExpired("not-a-date", 60,),).toBe(true,);
  });

  test("a fresh activation is still cooling down", () => {
    const now = new Date().toISOString();
    expect(isCooldownExpired(now, 3600,),).toBe(false,);
  });

  test("an activation older than the cooldown has expired", () => {
    const old = new Date(Date.now() - 61_000,).toISOString();
    expect(isCooldownExpired(old, 60,),).toBe(true,);
  });

  test("exact cooldown boundary counts as expired", () => {
    const boundary = new Date(Date.now() - 60_000,).toISOString();
    expect(isCooldownExpired(boundary, 60,),).toBe(true,);
  });
});
