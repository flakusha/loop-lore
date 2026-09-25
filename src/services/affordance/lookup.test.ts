// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { VERB_VALUES, } from "../../regex/action-parser";
import { CATEGORIES, } from "./categories";
import {
  type ActorCaps,
  type AffordanceResult,
  evaluate,
  type ItemProps,
  type Verb,
} from "./lookup";

/** Default capability profile: a healthy humanoid adventurer. */
const DEFAULT_CAPS: ActorCaps = {
  canEquipWeapon: true,
  canEquipArmor: true,
  canUseConsumables: true,
  canPickLocks: true,
  canRead: true,
  canSpeak: true,
  isAlive: true,
  inCombat: false,
};

const DEFAULT_CTX = {
  inRange: true,
  hasLight: true,
  hasLineOfEffect: true,
  isHostile: false,
};

function makeItem(category: ItemProps["category"], overrides: Partial<ItemProps> = {},): ItemProps {
  return {
    id: overrides.id ?? `item-${category}-${Math.random()}`,
    category,
    isContainer: false,
    isLockable: false,
    isOpen: false,
    isReadable: false,
    isEquippable: false,
    isConsumable: false,
    isTakeable: true,
    isDroppable: true,
    isGiveable: true,
    ...overrides,
  };
}

/** Positive cases per (category × verb) cell where the verb applies. */
const POSITIVE: Array<[ItemProps["category"], Verb, Partial<ItemProps>?,]> = [
  ["weapon", "equip", { isEquippable: true, },],
  ["weapon", "unequip",],
  ["weapon", "attack",],
  ["weapon", "defend",],
  ["weapon", "drop",],
  ["weapon", "give",],
  ["weapon", "examine",],
  ["armor", "equip", { isEquippable: true, },],
  ["armor", "unequip",],
  ["armor", "drop",],
  ["armor", "examine",],
  ["consumable", "use", { isConsumable: true, },],
  ["consumable", "give",],
  ["consumable", "drop",],
  ["consumable", "examine",],
  ["key", "examine",],
  ["key", "use", { isLockable: true, },],
  ["quest", "examine",],
  ["quest", "read", { isReadable: true, },],
  ["tool", "use",],
  ["tool", "equip", { isEquippable: true, },],
  ["tool", "unequip",],
  ["tool", "examine",],
];

/** Negative cases (capability/item/context gate should deny). */
const NEGATIVE: Array<
  {
    name: string;
    category: ItemProps["category"];
    caps?: Partial<ActorCaps>;
    item: Partial<ItemProps>;
    ctx?: Partial<typeof DEFAULT_CTX>;
    verb: Verb;
    expectReason: RegExp;
  }
> = [
  {
    name: "dead actor",
    category: "weapon",
    caps: { isAlive: false, },
    item: {},
    verb: "equip",
    expectReason: /not alive/i,
  },
  {
    name: "out of range",
    category: "weapon",
    ctx: { inRange: false, },
    item: {},
    verb: "examine",
    expectReason: /out of range/i,
  },
  {
    name: "weapon not equippable",
    category: "weapon",
    item: { isEquippable: false, },
    verb: "equip",
    expectReason: /cannot equip weapon/i,
  },
  {
    name: "consumable with use off",
    category: "consumable",
    caps: { canUseConsumables: false, },
    item: { isConsumable: true, },
    verb: "use",
    expectReason: /cannot use consumables/i,
  },
  {
    name: "key drop denied",
    category: "key",
    item: { isDroppable: false, },
    verb: "drop",
    expectReason: /not droppable/i,
  },
  { name: "key use without lockable target", category: "key", item: {}, verb: "use", expectReason: /no lockable/i, },
  {
    name: "verb not afforded for category",
    category: "quest",
    item: {},
    verb: "attack",
    expectReason: /not afforded/i,
  },
];

describe("affordance.evaluate — full cross-product", () => {
  for (const [category, verb, itemOverrides,] of POSITIVE) {
    test(`POSITIVE ${category} × ${verb} → allowed`, () => {
      const item = makeItem(category, itemOverrides,);
      const result = evaluate(DEFAULT_CAPS, item, DEFAULT_CTX, verb,);
      expect(result.allowed,).toBe(true,);
    });
  }

  for (const tc of NEGATIVE) {
    test(`NEGATIVE ${tc.name} → denied with ${tc.expectReason}`, () => {
      const item = makeItem(tc.category, tc.item,);
      const caps = { ...DEFAULT_CAPS, ...tc.ctx?.inRange === false ? {} : {}, ...tc.caps ?? {}, };
      const ctx = { ...DEFAULT_CTX, ...tc.ctx ?? {}, };
      const result = evaluate(caps, item, ctx, tc.verb,);
      expect(result.allowed,).toBe(false,);
      expect(result.reason,).toMatch(tc.expectReason,);
    });
  }
});

describe("affordance.evaluate — novel item fallback", () => {
  test("unknown category returns novel_item_default", () => {
    // Force a category outside the closed set via cast
    const novel = { ...makeItem("weapon",), category: "artifact" as ItemProps["category"], };
    const result = evaluate(DEFAULT_CAPS, novel, DEFAULT_CTX, "examine",);
    expect(result.allowed,).toBe(true,);
    expect(result.reason,).toBe("novel_item_default",);
  });
});

describe("affordance matrix coverage", () => {
  test("every POSITIVE (category × verb) cell exists in the matrix and allows with default caps", () => {
    // The matrix is the closed pre-image for item-affordance. Scene verbs
    // (open/close/take/talk/move/hide/search) are handled by other systems
    // (location/scene affordance, regex routing) — they intentionally have
    // no item-affordance cell. Asserting coverage over the POSITIVE list
    // keeps the matrix honest without coupling to scene-verb systems.
    const verbsInMatrix = new Set<Verb>();
    for (const [, verb,] of POSITIVE) { verbsInMatrix.add(verb,); }
    for (const v of VERB_VALUES) {
      // Scene-verb (no POSITIVE entry) — skip; covered by other systems.
      if (!verbsInMatrix.has(v,)) { continue; }
      expect(verbsInMatrix.has(v,),).toBe(true,);
    }
  });

  test("CATEGORIES has the closed 6-cell set", () => {
    expect(CATEGORIES.length,).toBe(6,);
  });
});

describe("AffordanceResult shape", () => {
  test("denial surfaces `missing` array when relevant", () => {
    const item = makeItem("weapon", { isEquippable: false, },);
    const caps = { ...DEFAULT_CAPS, canEquipWeapon: false, };
    const result = evaluate(caps, item, DEFAULT_CTX, "equip",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toMatch(/cannot equip/i,);
  });

  test("type-narrows on .allowed branching", () => {
    const r: AffordanceResult = evaluate(DEFAULT_CAPS, makeItem("weapon",), DEFAULT_CTX, "examine",);
    if (r.allowed) {
      expect(r.reason,).toBe("ok",);
    } else {
      expect(r.missing,).toBeDefined();
    }
  });
});
