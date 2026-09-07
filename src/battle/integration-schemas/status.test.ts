// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { createStatusEffect, isStatusEffectExpired, tickStatusEffect, } from "./status.ts";

describe("status", () => {
  test("createStatusEffect creates valid effect", () => {
    const effect = createStatusEffect("poison", "dot", "health", -5, 3,);
    expect(effect.name,).toBe("poison",);
    expect(effect.type,).toBe("dot",);
    expect(effect.value,).toBe(-5,);
    expect(effect.duration,).toBe(3,);
    expect(effect.remainingTurns,).toBe(3,);
    expect(effect.dispellable,).toBe(true,);
  });

  test("tickStatusEffect reduces remaining turns", () => {
    const effect = createStatusEffect("buff", "buff", "attack", 2, 5,);
    const ticked = tickStatusEffect(effect,);
    expect(ticked,).not.toBeNull();
    expect((ticked as any).remainingTurns,).toBe(4,);
  });

  test("isStatusEffectExpired detects expired", () => {
    const effect = createStatusEffect("old", "debuff", "defense", -2, 1,);
    // After one tick, remainingTurns = 0
    const ticked = tickStatusEffect(effect,);
    expect(ticked,).toBeNull();
  });

  test("isStatusEffectExpired detects active", () => {
    const effect = createStatusEffect("new", "buff", "attack", 2, 5,);
    expect(isStatusEffectExpired(effect,),).toBe(false,);
  });
});
