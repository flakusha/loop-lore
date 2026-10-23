// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item effect parsing tests — validation and error paths of
 * parseItemEffects / resolveItemEffects.
 *
 * Resource contract: pure — no DB, no globals. Order-independent.
 */
import { describe, expect, test, } from "bun:test";
import { InvalidItemEffectsError, parseItemEffects, resolveItemEffects, } from "./effects";
import type { ItemInstance, } from "./types";

function instance(effects: unknown,): ItemInstance {
  return {
    worldItemId: "wi-1",
    itemId: "item-1",
    name: "Iron Sword",
    description: "A plain iron sword.",
    category: "weapon",
    rarity: "common",
    quantity: 1,
    properties: { effects, },
    value: 10,
    weight: 1,
    visibility: "visible",
  } as ItemInstance;
}

describe("parseItemEffects", () => {
  test("returns [] for undefined (no effects declared)", () => {
    expect(parseItemEffects(undefined,),).toEqual([],);
  });

  test("parses a valid stat_delta effect", () => {
    expect(parseItemEffects([{ kind: "stat_delta", stat: "strength", amount: 2, },],),).toEqual([
      { kind: "stat_delta", stat: "strength", amount: 2, },
    ],);
  });

  test("parses on_use and passive effects with arbitrary payloads", () => {
    const effects = parseItemEffects([
      { kind: "on_use", action: "heal", payload: { hp: 10, }, },
      { kind: "passive", condition: "in_shrine", payload: "glow", },
    ],);

    expect(effects,).toEqual([
      { kind: "on_use", action: "heal", payload: { hp: 10, }, },
      { kind: "passive", condition: "in_shrine", payload: "glow", },
    ],);
  });

  test("rejects a non-array effects value", () => {
    expect(() => parseItemEffects({ kind: "stat_delta", },)).toThrow(InvalidItemEffectsError,);
    expect(() => parseItemEffects("stat_delta",)).toThrow(/must be an array/,);
  });

  test("rejects malformed entries: wrong kind, empty stat, non-finite amount, missing payload", () => {
    expect(() => parseItemEffects([{ kind: "teleport", },],)).toThrow(/invalid effect/,);
    expect(() => parseItemEffects([{ kind: "stat_delta", stat: "  ", amount: 1, },],)).toThrow(
      InvalidItemEffectsError,
    );

    expect(() => parseItemEffects([{ kind: "stat_delta", stat: "hp", amount: Number.NaN, },],)).toThrow(
      InvalidItemEffectsError,
    );

    expect(() => parseItemEffects([{ kind: "on_use", action: "heal", },],)).toThrow(
      InvalidItemEffectsError,
    );

    expect(() => parseItemEffects([null,],)).toThrow(InvalidItemEffectsError,);
    expect(() => parseItemEffects(["stat_delta",],)).toThrow(InvalidItemEffectsError,);
  });
});

describe("resolveItemEffects", () => {
  test("resolves effects from an instance's properties", () => {
    const item = instance([{ kind: "stat_delta", stat: "charisma", amount: -1, },],);
    expect(resolveItemEffects(item,),).toEqual([{ kind: "stat_delta", stat: "charisma", amount: -1, },],);
  });

  test("returns [] when the instance declares no effects", () => {
    expect(resolveItemEffects(instance(undefined,),),).toEqual([],);
  });

  test("propagates the invalid-effects error from the instance payload", () => {
    expect(() => resolveItemEffects(instance("nope",),)).toThrow(InvalidItemEffectsError,);
  });
});
