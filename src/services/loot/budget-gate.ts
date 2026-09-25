// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encounter loot budget gate (5e Sane Magical Prices × affordance).
 *
 * `enforceLootBudget(dropTable, encounterBudget, partyCapabilities)`:
 *   1. Filters by encounter budget (`sum(rarity × qty) <= budget`)
 *   2. Re-evaluates each surviving row via the affordance matrix
 *      (`evaluate(...).allowed`); disallowed items either rare-downshift
 *      or move to `dropped`.
 *
 * No LLM call. No mutation of inputs. Pure function.
 *
 * @module services/loot/budget-gate
 */

import { type ItemRarity, } from "../../db/enums";
import { type ActorCaps, type ContextState, evaluate, type ItemProps, } from "../affordance/lookup";

/** Reference to a party member (loot eligibility uses their capabilities). */
export interface PartyMember {
  actorId: string;
  caps: ActorCaps;
}

export interface PartyCapabilities {
  members: readonly PartyMember[];
  /** Aggregated party level — gates very-rare / legendary bands. */
  averageLevel: number;
  /** World-specific context (light, line of effect) applied to all members. */
  world: ContextState;
}

export interface LootRow {
  /** Display name. */
  name: string;
  rarity: ItemRarity;
  category: ItemProps["category"];
  quantity: number;
  /** Approx. gold cost (rarity × 100 × rarity-tier). */
  unitCost: number;
  isEquippable: boolean;
  isConsumable: boolean;
  isLockable?: boolean;
  isReadable?: boolean;
}

export interface EncounterBudget {
  /** Soft cap on `unitCost × quantity` summed across the table. */
  cap: number;
}

export interface LootGateResult {
  allowed: LootRow[];
  dropped: LootRow[];
  reason: string;
}

/**
 * 5e rarity bands by minimum party level (Sane Magical Prices).
 *
 * ponytail: bands use the project's existing `ItemRarity` enum (Common /
 * Uncommon / Rare / Epic / Legendary / Unique / Artifact). The 5e layout
 * maps Very Rare → Epic, Legendary → Legendary; the rare-downshift path
 * walks Common → Artifact. Tune at admin time.
 */
const RARITY_BANDS: Array<{ rarity: ItemRarity; minLevel: number }> = [
  { rarity: "common", minLevel: 1, },
  { rarity: "uncommon", minLevel: 5, },
  { rarity: "rare", minLevel: 9, },
  { rarity: "epic", minLevel: 13, },
  { rarity: "legendary", minLevel: 17, },
  { rarity: "unique", minLevel: 17, },
  { rarity: "artifact", minLevel: 17, },
];

/** Approximate ordering used by the rare-downshift function. */
const RARITY_ORDER: ItemRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "unique", "artifact",];

/**
 * Return `true` if `partyLevel` meets the rarity's minimum level.
 * @param rarity
 * @param partyLevel
 */
function isRarityAllowed(rarity: ItemRarity, partyLevel: number,): boolean {
  const band = RARITY_BANDS.find((b,) => b.rarity === rarity);
  return !band || partyLevel >= band.minLevel;
}

/**
 * Walk `rarity` down toward `Common` until level-allowed.
 * Returns `null` if already at `common` but not allowed.
 */
function rareDownshift(rarity: ItemRarity, partyLevel: number,): ItemRarity | null {
  let current = rarity;
  while (!isRarityAllowed(current, partyLevel,)) {
    const idx = RARITY_ORDER.indexOf(current,);
    if (idx <= 0) { return null; }
    current = RARITY_ORDER[idx - 1]!;
  }
  return current;
}

function makeItemProps(row: LootRow,): ItemProps {
  return {
    id: row.name,
    category: row.category,
    isContainer: false,
    isLockable: row.isLockable ?? false,
    isOpen: false,
    isReadable: row.isReadable ?? false,
    isEquippable: row.isEquippable,
    isConsumable: row.isConsumable,
    isTakeable: true,
    isDroppable: true,
    isGiveable: true,
  };
}

/**
 * Public entry point — never mutates `dropTable`. Pure function.
 *
 * Strategy:
 *   1. Filter by encounter budget (greedy: take the costliest rows first).
 *   2. For each kept row: rare-band gate → affordance gate.
 *   3. If either denies, try rare-downshift; if that fails, move to `dropped`.
 */
export function enforceLootBudget(
  dropTable: readonly LootRow[],
  encounterBudget: EncounterBudget,
  party: PartyCapabilities,
): LootGateResult {
  // 1. Budget filter — sort by cost descending, take until cap exceeded.
  const sorted = [...dropTable,].sort((a, b,) => b.unitCost * b.quantity - a.unitCost * a.quantity);
  let budget = 0;
  const inBudget: LootRow[] = [];
  for (const row of sorted) {
    const cost = row.unitCost * row.quantity;
    if (budget + cost > encounterBudget.cap) { continue; }
    inBudget.push(row,);
    budget += cost;
  }

  // 2. + 3. Affordance + rarity gates
  const allowed: LootRow[] = [];
  const dropped: LootRow[] = [];
  for (const row of inBudget) {
    if (!isRarityAllowed(row.rarity, party.averageLevel,)) {
      const shifted = rareDownshift(row.rarity, party.averageLevel,);
      if (!shifted) {
        dropped.push(row,);
        continue;
      }
      allowed.push({ ...row, rarity: shifted, },);
      continue;
    }

    const anyMemberCanUse = party.members.some((m,) => {
      const props = makeItemProps(row,);
      const result = evaluate(m.caps, props, party.world, row.category === "weapon" ? "equip" : "use",);
      return result.allowed;
    },);
    if (!anyMemberCanUse) {
      dropped.push(row,);
      continue;
    }

    allowed.push(row,);
  }

  const reason = dropped.length === 0
    ? "all loot in budget and afforded"
    : `dropped ${dropped.length} item(s) due to rarity band or party capability`;
  return { allowed, dropped, reason, };
}

export { RARITY_BANDS, RARITY_ORDER, };
