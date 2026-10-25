// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battles item actions: usable battle items + consuming one in combat.
 *
 * "Usable in battle" = a `consumable` row with stock whose metadata declares
 * an on-use heal effect (shared `ItemEffect` encoding,
 * `src/story/items/effects.ts`) — the one item effect the combat engine can
 * apply today, via the same `healCombatant` mechanic as `/heal`. Parsing is
 * tolerant so a malformed `actor_items.metadata` never breaks the panel.
 */

import { triggerItemOutfitChange, } from "../../../characters/services/wardrobe/item-trigger";
import { ItemCategory, } from "../../../db/enums";
import {
  ActionType,
  type CombatAction,
  consumeAction,
  healCombatant,
} from "../../../rpg/combat.js";
import { jsonParseOr, } from "../../../utils/safe-json.js";
import { log, } from "../log.js";
import type { RpgServiceDeps, } from "../types.js";
import { persistBattle, requireActiveBattle, } from "./persistence.js";
import {
  type BattleItemView,
  BattleStatus,
  type ResolvedItemUse,
  type UseItemParams,
} from "./types.js";

/** Raw inventory columns the battle-item helpers need. */
export interface UsableItemRow {
  id: string;
  name: string;
  quantity: number;
  item_type: string;
  metadata: string | null;
}

/** Shape of an `on_use` heal effect payload. */
interface HealEffect {
  kind?: unknown;
  action?: unknown;
  payload?: unknown;
}

/**
 * Parse the on-use heal amount from an `actor_items.metadata` JSON payload.
 * Accepts a bare effects array or an `{ effects: [...] }` wrapper (the two
 * shapes the shared ItemEffect encoding appears in). Invalid payloads and
 * non-heal effects yield null.
 * @param metadata - Raw metadata JSON string (or null)
 * @returns The heal amount, or null when the item has no usable heal effect
 */
export function onUseHealAmount(metadata: string | null,): number | null {
  if (!metadata) { return null; }
  const parsed = jsonParseOr<unknown>(metadata, null,);
  const effects = Array.isArray(parsed,)
    ? parsed
    : parsed !== null && typeof parsed === "object"
    ? (parsed as { effects?: unknown }).effects
    : null;

  if (!Array.isArray(effects,)) { return null; }

  for (const effect of effects) {
    if (!effect || typeof effect !== "object") { continue; }
    const e = effect as HealEffect;
    if (e.kind !== "on_use" || e.action !== "heal") { continue; }
    const amount = (e.payload as { amount?: unknown } | undefined)?.amount;
    if (typeof amount === "number" && Number.isFinite(amount,) && amount > 0) {
      return amount;
    }
  }

  return null;
}

/**
 * Filter raw inventory rows down to battle-usable item views, name-sorted.
 * @param rows - The actor's `actor_items` rows
 * @returns Consumables with stock and an on-use heal effect
 */
export function usableBattleItems(rows: UsableItemRow[],): BattleItemView[] {
  return rows
    .filter((row,) => row.item_type === ItemCategory.Consumable && row.quantity > 0)
    .filter((row,) => onUseHealAmount(row.metadata,) !== null)
    .map((row,) => ({ id: row.id, name: row.name, quantity: row.quantity, }))
    .sort((a, b,) => a.name.localeCompare(b.name,));
}

/**
 * Find a usable item by exact id, then exact name, then loose name match
 * (mirrors `findCombatant`).
 * @param items - Usable item views
 * @param needle - Raw `/battle use` item argument
 * @returns The matching item, or null
 */
export function findUsableItem(items: BattleItemView[], needle: string,): BattleItemView | null {
  const lower = needle.trim().toLowerCase();
  if (!lower) { return null; }
  return items.find((item,) => item.id.toLowerCase() === lower) ??
    items.find((item,) => item.name.toLowerCase() === lower) ??
    items.find((item,) => item.name.toLowerCase().includes(lower,)) ??
    null;
}

/**
 * Load the raw inventory rows the battle-item helpers reason over.
 * @param deps - Service dependencies
 * @param actorId - Item owner
 */
async function loadUsableItemRows(deps: RpgServiceDeps, actorId: string,): Promise<UsableItemRow[]> {
  return deps.database
    .selectFrom("actor_items",)
    .select(["id", "name", "quantity", "item_type", "metadata",],)
    .where("actor_id", "=", actorId,)
    .execute();
}

/**
 * List an actor's battle-usable items.
 * @param deps - Service dependencies
 * @param actorId - Item owner
 * @returns Usable consumables (name-sorted)
 */
export async function listUsableBattleItems(
  deps: RpgServiceDeps,
  actorId: string,
): Promise<BattleItemView[]> {
  return usableBattleItems(await loadUsableItemRows(deps, actorId,),);
}

/**
 * Consume a battle-usable item on a target combatant and persist the result.
 *
 * The item's on-use heal amount feeds the existing `healCombatant` mechanic
 * (same as `/heal`); the acting combatant spends its item action; one unit is
 * consumed (the inventory row is deleted when the stack empties, matching the
 * crafting consumption convention).
 * @param deps - Service dependencies
 * @param params - Battle, actor, target and item resolution
 * @returns The consumed item + updated roster
 * @throws {Error} When the actor/target/item is unusable in this battle or the stock was concurrently modified.
 */
export async function useBattleItem(
  deps: RpgServiceDeps,
  params: UseItemParams,
): Promise<ResolvedItemUse> {
  const battle = await requireActiveBattle(deps, params.battleId,);

  const actor = battle.combatants.find((c,) => c.id === params.actorId);
  if (!actor) {
    throw new Error(`Actor ${params.actorId} is not in this battle.`,);
  }

  if (actor.hp <= 0) {
    throw new Error(`${actor.name} is defeated and cannot use items.`,);
  }

  let target = actor;
  if (params.targetId && params.targetId !== actor.id) {
    const requested = battle.combatants.find((c,) => c.id === params.targetId);
    if (!requested) {
      throw new Error(`Target ${params.targetId} is not in this battle.`,);
    }

    target = requested;
  }

  const rows = await loadUsableItemRows(deps, actor.id,);
  const item = findUsableItem(usableBattleItems(rows,), params.itemId,);
  if (!item) {
    throw new Error(`No usable battle item matches "${params.itemId}".`,);
  }

  const row = rows.find((r,) => r.id === item.id);
  const healAmount = onUseHealAmount(row?.metadata ?? null,);
  if (healAmount === null) {
    throw new Error(`${item.name} has no usable battle effect.`,);
  }

  const healedCombatant = healCombatant(target, healAmount,);
  const healed = healedCombatant.hp - target.hp;

  const updated = Array.from(battle.combatants, (c,) => {
    if (c.id === target.id) { return healedCombatant; }
    return c.id === actor.id ? consumeAction(c, ActionType.UseItem,) : c;
  },);

  const action: CombatAction = {
    actorId: actor.id,
    type: ActionType.UseItem,
    targetId: target.id,
    damage: healed,
    description: `${actor.name} uses ${item.name} on ${target.name} — restores ${healed} HP.`,
  };

  // Consume + persist are one atomic unit: a failure between them must roll
  // the inventory consumption back (BUG-usebattleitem-consumes-inventory-and-persists-battle-outside).
  let remaining = 0;
  await deps.database.transaction().execute(async (trx,) => {
    const trxDeps: RpgServiceDeps = { ...deps, database: trx, };

    remaining = await consumeInventoryUnit(trxDeps, item.id, item.quantity,);

    await persistBattle(
      trxDeps,
      battle.id,
      battle.round,
      battle.turnIndex,
      updated,
      [...battle.log, action,],
      BattleStatus.Active,
    );
  },);

  log().debug("Battle item used", { battleId: battle.id, itemId: item.id, healed, },);

  return {
    item: { ...item, quantity: remaining, },
    actor,
    target: healedCombatant,
    healed,
    combatants: updated,
    battleId: battle.id,
  };
}

/**
 * Decrement a stack by one; delete the row when it empties.
 * @param deps
 * @param itemId
 * @param current
 * @returns The remaining quantity (0 when the row was deleted)
 * @throws {Error} When the item row was concurrently modified.
 */
async function consumeInventoryUnit(
  deps: RpgServiceDeps,
  itemId: string,
  current: number,
): Promise<number> {
  if (current <= 1) {
    const owner = await deps.database
      .selectFrom("actor_items",)
      .select("actor_id",)
      .where("id", "=", itemId,)
      .executeTakeFirst();

    if (owner?.actor_id) { await triggerItemOutfitChange(deps.database, owner.actor_id, itemId,); }

    const result = await deps.database
      .deleteFrom("actor_items",)
      .where("id", "=", itemId,)
      .where("quantity", "=", current,)
      .executeTakeFirst();

    if (Number(result.numDeletedRows ?? 0,) === 0) {
      throw new Error(`Item ${itemId} was modified concurrently`,);
    }

    return 0;
  }

  const result = await deps.database
    .updateTable("actor_items",)
    .set({ quantity: current - 1, },)
    .where("id", "=", itemId,)
    .where("quantity", "=", current,)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0,) === 0) {
    throw new Error(`Item ${itemId} was modified concurrently`,);
  }

  return current - 1;
}
