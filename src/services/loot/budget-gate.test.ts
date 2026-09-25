// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  type EncounterBudget,
  enforceLootBudget,
  type LootRow,
  type PartyCapabilities,
  type PartyMember,
  RARITY_BANDS,
} from "./budget-gate";

const PARTY: PartyCapabilities = {
  averageLevel: 12,
  members: [
    { actorId: "p1", caps: { canEquipWeapon: true, canEquipArmor: true, canUseConsumables: true, canPickLocks: true, canRead: true, canSpeak: true, isAlive: true, inCombat: false, }, },
  ],
  world: { inRange: true, hasLight: true, hasLineOfEffect: true, isHostile: false, },
};

const BUDGET: EncounterBudget = { cap: 5000, };

const COMMON_SWORD: LootRow = { name: "long sword +1", rarity: "uncommon", category: "weapon", quantity: 1, unitCost: 500, isEquippable: true, isConsumable: false, };
const LEGENDARY: LootRow = { name: "holy avenger", rarity: "legendary", category: "weapon", quantity: 1, unitCost: 50_000, isEquippable: true, isConsumable: false, };
const POTION: LootRow = { name: "healing potion", rarity: "common", category: "consumable", quantity: 5, unitCost: 50, isEquippable: false, isConsumable: true, };
const KEY: LootRow = { name: "rusty key", rarity: "common", category: "key", quantity: 1, unitCost: 1, isEquippable: false, isConsumable: false, isLockable: true, };

describe("enforceLootBudget — happy path", () => {
  test("mid-level party gets matching uncommon + consumables", () => {
    const result = enforceLootBudget([COMMON_SWORD, POTION, KEY,], BUDGET, PARTY,);
    expect(result.allowed.length,).toBeGreaterThanOrEqual(2,);
    expect(result.dropped,).toEqual([],);
    expect(result.reason,).toMatch(/in budget/i,);
  },);
},);

describe("enforceLootBudget — negative: legendary at low level", () => {
  test("L1 party cannot receive legendary (drops or downshifts)", () => {
    const lowParty: PartyCapabilities = { ...PARTY, averageLevel: 1, };
    const result = enforceLootBudget([LEGENDARY,], BUDGET, lowParty,);
    // Either dropped outright OR rare-downshifted to epic (allowed at L13+ but
    // not L1, so will eventually hit common → drop). Accept either path here:
    // the invariant is that the party doesn't end up with a `legendary` row.
    const hasLegendary = result.allowed.some((r,) => r.rarity === "legendary",);
    expect(hasLegendary,).toBe(false,);
  },);

  test("L18 party receives legendary unchanged", () => {
    const highParty: PartyCapabilities = { ...PARTY, averageLevel: 18, };
    const result = enforceLootBudget([LEGENDARY,], { cap: 100_000, }, highParty,);
    expect(result.allowed,).toContainEqual(LEGENDARY,);
    expect(result.dropped,).toEqual([],);
  },);
},);

describe("enforceLootBudget — budget cap", () => {
  test("items exceeding the encounter budget are dropped", () => {
    const tight: EncounterBudget = { cap: 100, };
    const result = enforceLootBudget([COMMON_SWORD, POTION,], tight, PARTY,);
    const totalCost = result.allowed.reduce((acc, r,) => acc + r.unitCost * r.quantity, 0,);
    expect(totalCost,).toBeLessThanOrEqual(100,);
  },);
},);

describe("enforceLootBudget — affordance gate", () => {
  test("weapon dropped when party cannot equip weapons", () => {
    const unarmed: PartyMember = { actorId: "p1", caps: { ...PARTY.members[0]!.caps, canEquipWeapon: false, }, };
    const result = enforceLootBudget([COMMON_SWORD,], BUDGET, { ...PARTY, members: [unarmed,], },);
    expect(result.dropped,).toContainEqual(COMMON_SWORD,);
  },);
},);

describe("RARITY_BANDS reference", () => {
  test("contains the canonical 5e baseline", () => {
    expect(RARITY_BANDS.length,).toBeGreaterThanOrEqual(5,);
    const legendary = RARITY_BANDS.find((b,) => b.rarity === "legendary",);
    expect(legendary?.minLevel,).toBe(17,);
  },);

  test("rarity ordering monotonically increases minimum level", () => {
    let lastLevel = 0;
    for (const band of RARITY_BANDS) {
      expect(band.minLevel,).toBeGreaterThanOrEqual(lastLevel,);
      lastLevel = band.minLevel;
    }
  },);
},);
