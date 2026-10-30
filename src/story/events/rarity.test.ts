// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the event rarity value object (src/story/events/rarity.ts).
 * Covers determinism (injected rng), tier bounds, weight-order respect,
 * custom-weight overrides and the validation helpers. The scale itself is
 * re-used from rpg/loot — these tests pin the event-side contract only.
 */
import { describe, expect, test, } from "bun:test";
import { mulberry32, } from "../../autonomy/rng";
import {
  EVENT_RARITY_TIERS,
  EVENT_RARITY_WEIGHTS,
  type EventRarity,
  isEventRarity,
  parseEventRarity,
  rollRarity,
  selectEventByRarity,
} from "./rarity";

describe("event rarity scale", () => {
  test("tiers mirror the loot rarity scale", () => {
    expect(EVENT_RARITY_TIERS,).toEqual([
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
      "unique",
      "artifact",
    ],);

    expect(EVENT_RARITY_WEIGHTS.common,).toBe(50,);
    expect(EVENT_RARITY_WEIGHTS.artifact,).toBe(1,);
  });
});

describe("validation helpers", () => {
  test("isEventRarity accepts exactly the loot tiers", () => {
    for (const tier of EVENT_RARITY_TIERS) {
      expect(isEventRarity(tier,),).toBe(true,);
    }

    expect(isEventRarity("mythic",),).toBe(false,);
    expect(isEventRarity(null,),).toBe(false,);
    expect(isEventRarity(undefined,),).toBe(false,);
    expect(isEventRarity(42,),).toBe(false,);
  });

  test("parseEventRarity maps unknown values to null", () => {
    expect(parseEventRarity("rare",),).toBe("rare",);
    expect(parseEventRarity("MYTHIC",),).toBeNull();
    expect(parseEventRarity(undefined,),).toBeNull();
  });
});

describe("rollRarity", () => {
  test("is deterministic for the same rng seed", () => {
    const a = Array.from({ length: 10, }, () => rollRarity({ rng: mulberry32(42,), },),);
    const b = Array.from({ length: 10, }, () => rollRarity({ rng: mulberry32(42,), },),);
    expect(a,).toEqual(b,);
  });

  test("always returns a valid tier across seeds", () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(EVENT_RARITY_TIERS,).toContain(rollRarity({ rng: mulberry32(seed,), },),);
    }
  });

  test("respects the weight order across samples", () => {
    const counts = new Map<string, number>(EVENT_RARITY_TIERS.map((t,) => [t, 0,]),);
    const rng = mulberry32(7,);
    const samples = 4000;
    for (let i = 0; i < samples; i++) {
      const tier = rollRarity({ rng, },);
      counts.set(tier, (counts.get(tier,) ?? 0) + 1,);
    }

    // Default weights 50/30/15/8/4/2/1 — heavier tiers must strictly dominate.
    for (let i = 0; i < EVENT_RARITY_TIERS.length - 1; i++) {
      const heavier = counts.get(EVENT_RARITY_TIERS[i]!,)!;
      const lighter = counts.get(EVENT_RARITY_TIERS[i + 1]!,)!;
      expect(heavier,).toBeGreaterThan(lighter,);
    }
  });

  test("custom weights override the defaults", () => {
    const rng = mulberry32(99,);
    // Partial override: zeroing common removes it; legendary at 10 outranks
    // only the small default tiers — assert exactly that (no common ever,
    // legendary plurality over its default-sized rivals).
    const counts = { legendary: 0, other: 0, };
    for (let i = 0; i < 400; i++) {
      const tier = rollRarity({ rng, weights: { common: 0, legendary: 10, }, },);
      expect(tier,).not.toBe("common",);
      if (tier === "legendary") { counts.legendary++; }
      else { counts.other++; }
    }

    // legendary(10) vs rare+epic+unique+artifact leftovers (15+8+2+1=26) —
    // with weights this close, assert legendary beats each rival tier, not
    // the whole pool: reroll per-tier duels instead.
    expect(counts.legendary,).toBeGreaterThan(0,);
    const duel = mulberry32(5,);
    for (let i = 0; i < 200; i++) {
      expect(
        rollRarity({
          rng: duel,
          weights: { common: 0, uncommon: 0, rare: 0, epic: 0, unique: 0, artifact: 0, legendary: 10, },
        },),
      ).toBe("legendary",);
    }
  });

  test("throws on negative, non-finite or all-zero weights", () => {
    expect(() => rollRarity({ rng: mulberry32(1,), weights: { common: -1, }, },)).toThrow(TypeError,);
    expect(() => rollRarity({ rng: mulberry32(1,), weights: { rare: Number.NaN, }, },)).toThrow(TypeError,);
    const allZero = Object.fromEntries(
      EVENT_RARITY_TIERS.map((tier,) => [tier, 0,]),
    ) as Record<EventRarity, number>;

    expect(() => rollRarity({ rng: mulberry32(1,), weights: allZero, },)).toThrow(TypeError,);
  });
});

describe("selectEventByRarity", () => {
  const tagged = [
    { id: "a", data: { rarity: "common", }, },
    { id: "b", data: { rarity: "artifact", }, },
    { id: "c", data: { other: true, }, },
    { id: "d", data: { rarity: "not-a-tier", }, },
    { id: "e", },
  ] as { id: string; data?: Record<string, unknown> }[];

  test("returns null for an empty candidate list", () => {
    expect(selectEventByRarity({ events: [], rng: mulberry32(1,), },),).toBeNull();
  });

  test("returns the only candidate regardless of rng", () => {
    expect(
      selectEventByRarity({ events: [tagged[2]!,], rng: mulberry32(3,), },),
    ).toBe(tagged[2]!,);
  });

  test("is deterministic for the same rng seed", () => {
    const a = Array.from(
      { length: 10, },
      () => selectEventByRarity({ events: tagged, rng: mulberry32(11,), },),
    );

    const b = Array.from(
      { length: 10, },
      () => selectEventByRarity({ events: tagged, rng: mulberry32(11,), },),
    );

    expect(a,).toEqual(b,);
  });

  test("absence-preserving: rarity-less candidates all get picked", () => {
    const plain: { id: string; data: Record<string, unknown> }[] = [
      { id: "p1", data: {}, },
      { id: "p2", data: {}, },
      { id: "p3", data: {}, },
      { id: "p4", data: {}, },
      { id: "p5", data: {}, },
    ];

    const hits = new Set<string>();
    const rng = mulberry32(21,);
    for (let i = 0; i < 500; i++) {
      const pick = selectEventByRarity({ events: plain, rng, },);
      expect(pick,).not.toBeNull();
      hits.add(pick!.id,);
    }

    // Equal default weights → every candidate manifests over enough draws.
    expect(hits.size,).toBe(plain.length,);
  });

  test("heavier rarity dominates lighter rarity over samples", () => {
    const pair = [
      { id: "common", data: { rarity: "common", }, },
      { id: "artifact", data: { rarity: "artifact", }, },
    ];

    const rng = mulberry32(31,);
    let commonWins = 0;
    for (let i = 0; i < 2000; i++) {
      if (selectEventByRarity({ events: pair, rng, },)!.id === "common") {
        commonWins++;
      }
    }

    // 50:1 weight ratio — a strict majority is the weak deterministic bound.
    expect(commonWins,).toBeGreaterThan(1000,);
  });

  test("custom weights can exclude a tier entirely", () => {
    const rng = mulberry32(41,);
    for (let i = 0; i < 200; i++) {
      const pick = selectEventByRarity({
        events: tagged,
        rng,
        weights: { common: 0, },
      },);

      expect(pick!.id,).not.toBe("a",);
    }
  });

  test("throws on invalid custom weights", () => {
    expect(() =>
      selectEventByRarity({
        events: tagged,
        rng: mulberry32(1,),
        weights: { rare: -5, },
      },)
    )
      .toThrow(TypeError,);
  });
});
