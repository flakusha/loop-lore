// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { CATEGORIES, } from "../affordance/categories";
import type { ActorCaps, ContextState, } from "../affordance/lookup";
import { evaluate, } from "../affordance/lookup";
import type { EquipSlot, } from "./equip";

/**
 * Affordance gate for actor item equip (TASK-affordance-lookup-table).
 * Returns the denial reason, or `null` when the equip is allowed (or no
 * matching category is mapped for `slot`).
 * @param itemId
 * @param slot
 * @param caps
 * @param ctx
 */
export async function checkEquipAffordance(
  itemId: string,
  slot: EquipSlot,
  caps: ActorCaps,
  ctx: ContextState,
): Promise<string | null> {
  const slotMap: Record<string, string> = { weapon: "weapon", armor: "armor", };
  const affordanceCategory = CATEGORIES.find((c,) => slotMap[slot] === c);
  if (!affordanceCategory) { return null; }
  const result = evaluate(
    caps,
    {
      id: itemId,
      category: affordanceCategory,
      isContainer: false,
      isLockable: false,
      isOpen: false,
      isReadable: false,
      isEquippable: true,
      isConsumable: false,
      isTakeable: true,
      isDroppable: true,
      isGiveable: true,
    },
    ctx,
    "equip",
  );
  return result.allowed ? null : result.reason;
}
