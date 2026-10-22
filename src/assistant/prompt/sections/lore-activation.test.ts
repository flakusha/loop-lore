// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Contract tests for the pure lore selective-activation rules. */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  type ActivationEntry,
  clampScanDepth,
  isCooldownExpired,
  matchesSelectiveKeys,
  MAX_SCAN_DEPTH,
  passesActivationChance,
} from "./lore-activation";

const originalRandom = Math.random;

function entry(overrides: Partial<ActivationEntry> = {},): ActivationEntry {
  return { keys: null, key_type: null, key_groups: null, scan_depth: null, activation_chance: null, ...overrides, };
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

describe("matchesSelectiveKeys", () => {
  const words = new Set(["dragon", "hoard",],);

  test("empty activation condition is always active", () => {
    expect(matchesSelectiveKeys(entry(), words, "no keys at all",),).toBe(true,);
  });

  test("regex keys match case-insensitively against the raw text", () => {
    expect(
      matchesSelectiveKeys(
        entry({ key_type: "regex", keys: JSON.stringify(["wyvern", "dragon",],), },),
        words,
        "the DRAGON sleeps",
      ),
    ).toBe(true,);

    expect(
      matchesSelectiveKeys(
        entry({ key_type: "regex", keys: JSON.stringify(["wyvern",],), },),
        words,
        "the dragon sleeps",
      ),
    ).toBe(false,);
  });

  test("regex keys with empty list are always active", () => {
    expect(matchesSelectiveKeys(entry({ key_type: "regex", keys: JSON.stringify([],), },), words, "anything",),).toBe(
      true,
    );
  });

  test("unsafe catastrophic regex is treated as no-match, never a crash", () => {
    expect(
      matchesSelectiveKeys(
        entry({ key_type: "regex", keys: JSON.stringify(["(a+)+$",],), },),
        words,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(false,);
  });

  test("key groups require every keyword of at least one AND group", () => {
    const groups = JSON.stringify([["dragon", "hoard",], ["elf",],],);
    expect(matchesSelectiveKeys(entry({ key_groups: groups, },), words, "",),).toBe(true,);
    expect(matchesSelectiveKeys(entry({ key_groups: JSON.stringify([["dragon", "sword",],],), },), words, "",),).toBe(
      false,
    );
  });

  test("malformed key groups fall back to plain keyword matching", () => {
    // "groups" is a flat array of strings, not a nest of arrays -> null.
    expect(
      matchesSelectiveKeys(
        entry({ key_groups: JSON.stringify(["dragon",],), keys: JSON.stringify(["hoard",],), },),
        words,
        "",
      ),
    ).toBe(true,);
  });

  test("plain keywords match against the lowercased word set", () => {
    expect(matchesSelectiveKeys(entry({ keys: JSON.stringify(["Dragon",],), },), words, "",),).toBe(true,);
    expect(matchesSelectiveKeys(entry({ keys: JSON.stringify(["goblin",],), },), words, "",),).toBe(false,);
  });

  test("plain keyword fallback also accepts comma-separated strings", () => {
    expect(matchesSelectiveKeys(entry({ keys: "goblin, HOARD", },), words, "",),).toBe(true,);
  });

  test("non-empty plain keyword list with no hits is inactive", () => {
    expect(matchesSelectiveKeys(entry({ keys: JSON.stringify(["orc", "troll",],), },), words, "dragon hoard",),).toBe(
      false,
    );
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
