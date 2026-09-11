// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for level-based proficiency bonus (D&D 5e standard, clamped 1-20). */
import { describe, expect, test, } from "bun:test";
import { proficiencyBonus, } from "./proficiency";

describe("proficiencyBonus", () => {
  test("follows the 5e table at tier boundaries", () => {
    expect(proficiencyBonus(1,),).toBe(2,);
    expect(proficiencyBonus(4,),).toBe(2,);
    expect(proficiencyBonus(5,),).toBe(3,);
    expect(proficiencyBonus(8,),).toBe(3,);
    expect(proficiencyBonus(9,),).toBe(4,);
    expect(proficiencyBonus(12,),).toBe(4,);
    expect(proficiencyBonus(13,),).toBe(5,);
    expect(proficiencyBonus(16,),).toBe(5,);
    expect(proficiencyBonus(17,),).toBe(6,);
    expect(proficiencyBonus(20,),).toBe(6,);
  });

  test("clamps out-of-range levels", () => {
    expect(proficiencyBonus(0,),).toBe(2,);
    expect(proficiencyBonus(-5,),).toBe(2,);
    expect(proficiencyBonus(99,),).toBe(6,);
  });
});
