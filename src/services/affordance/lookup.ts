// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Affordance lookup — `evaluate(actorCaps, itemProps, contextState, verb)`.
 *
 * Gibson/Norman: affordance is the cross-product of `(actor.capabilities,
 * item.properties, context.state)`. Hard-coding per-item verb lists does not
 * scale; the matrix below is the closed pre-image.
 *
 * @module services/affordance/lookup
 */

import { type Verb, VERB_VALUES, } from "../../regex/action-parser";
import { CATEGORIES, type Category, } from "./categories";
export type { Verb, };

/** Capabilities the actor has (race class, conditions, etc.). */
export interface ActorCaps {
  canEquipWeapon: boolean;
  canEquipArmor: boolean;
  canUseConsumables: boolean;
  canPickLocks: boolean;
  canRead: boolean;
  canSpeak: boolean;
  isAlive: boolean;
  inCombat: boolean;
}

/** Item-derived properties (subset of items table — slot + functional flags). */
export interface ItemProps {
  id: string;
  category: Category;
  isContainer: boolean;
  isLockable: boolean;
  isOpen: boolean;
  isReadable: boolean;
  isEquippable: boolean;
  isConsumable: boolean;
  isTakeable: boolean;
  isDroppable: boolean;
  isGiveable: boolean;
}

/** Scene/world context (proximity, light level, etc.). */
export interface ContextState {
  inRange: boolean;
  hasLight: boolean;
  hasLineOfEffect: boolean;
  isHostile: boolean;
}

/** Outcome of an affordance check. */
export interface AffordanceResult {
  allowed: boolean;
  reason: string;
  missing?: readonly string[];
}

const ALLOW: AffordanceResult = { allowed: true, reason: "ok", };
const NOVEL: AffordanceResult = { allowed: true, reason: "novel_item_default", missing: [], };

function deny(reason: string, ...missing: string[]): AffordanceResult {
  return { allowed: false, reason, missing, };
}

/**
 * Per-category verb matrix. Each cell maps a `{ category, verb }` pair to a
 * guard function. Default allow for unmapped pairs (defensive coverage).
 * ponytail: full cross-product is checked at test time; this is the source of truth.
 */
type Guard = (caps: ActorCaps, item: ItemProps, ctx: ContextState,) => AffordanceResult;

const MATRIX: Record<Category, Partial<Record<Verb, Guard>>> = {
  weapon: {
    equip: (caps, item,) => caps.canEquipWeapon && item.isEquippable ? ALLOW : deny("cannot equip weapon",),
    unequip: (caps,) => caps.isAlive ? ALLOW : deny("not alive",),
    attack: (caps, _item, ctx,) => ctx.hasLineOfEffect && caps.isAlive ? ALLOW : deny("no line of effect",),
    defend: (caps,) => caps.isAlive ? ALLOW : deny("not alive",),
    drop: (_caps, item,) => item.isDroppable ? ALLOW : deny("item is not droppable",),
    give: (_caps, item,) => item.isGiveable ? ALLOW : deny("item is not giveable",),
    examine: () => ALLOW,
  },
  armor: {
    equip: (caps, item,) => caps.canEquipArmor && item.isEquippable ? ALLOW : deny("cannot equip armor",),
    unequip: (caps,) => caps.isAlive ? ALLOW : deny("not alive",),
    examine: () => ALLOW,
    drop: (_caps, item,) => item.isDroppable ? ALLOW : deny("item is not droppable",),
  },
  consumable: {
    use: (caps, item,) => caps.canUseConsumables && item.isConsumable ? ALLOW : deny("cannot use consumables",),
    give: (_caps, item,) => item.isGiveable ? ALLOW : deny("item is not giveable",),
    drop: (_caps, item,) => item.isDroppable ? ALLOW : deny("item is not droppable",),
    examine: () => ALLOW,
  },
  key: {
    examine: () => ALLOW,
    drop: (_caps, item,) => item.isDroppable ? ALLOW : deny("key items are not droppable",),
    use: (_caps, item, ctx,) => item.isLockable && ctx.hasLineOfEffect ? ALLOW : deny("no lockable target in range",),
  },
  quest: {
    examine: () => ALLOW,
    read: (caps, item,) => caps.canRead && item.isReadable ? ALLOW : deny("cannot read or not readable",),
  },
  tool: {
    use: (caps,) => caps.canUseConsumables ? ALLOW : deny("cannot use tools",),
    equip: (_caps, item,) => item.isEquippable ? ALLOW : deny("tool is not equippable",),
    unequip: (caps,) => caps.isAlive ? ALLOW : deny("not alive",),
    examine: () => ALLOW,
  },
};

/**
 * Evaluate whether `actor` can perform `verb` on `item`.
 *
 * Novel items (not in the closed 6-category set) get the maximum
 * affordance: every affirmative verb is allowed, but the `reason` flags
 * the fallback so consumers can decide whether to gate.
 */
export function evaluate(
  caps: ActorCaps,
  item: ItemProps,
  ctx: ContextState,
  verb: Verb,
): AffordanceResult {
  // Distance / line-of-effect gate is universal
  if (!ctx.inRange) { return deny("target out of range", "inRange",); }
  if (!caps.isAlive) { return deny("actor is not alive", "isAlive",); }

  if (!CATEGORIES.includes(item.category,)) {
    return NOVEL;
  }

  const guard = MATRIX[item.category]?.[verb];
  if (!guard) {
    // Verb not in the cell matrix → conservative deny
    return deny(`verb '${verb}' not afforded for category '${item.category}'`, "verb_not_afforded",);
  }
  return guard(caps, item, ctx,);
}

/** Stable iteration order for test loops. */
export const CATEGORY_VALUES: readonly Category[] = CATEGORIES;
export { VERB_VALUES, };
