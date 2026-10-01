// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Equipped-items → outfit loadout bridge (deferred flag-gated phase).
 *
 * Ladder rung between location/world rule and character default (epic
 * ordering: chat override → location rule → equipped-loadout → default).
 * Mapping is deterministic: among currently EQUIPPED inventory instances
 * that have an `actor_wardrobe` binding, the most recently created
 * binding wins (last equip wins; id breaks created_at ties).
 *
 * Flag: `system_config` key `wardrobe_loadout_bridge`. Missing key or any
 * value other than "true" keeps the rung OFF — flag OFF preserves the
 * manual behavior (resolve falls straight through to the character
 * default), flag ON auto-switches on equip with no inventory mutation.
 *
 * Decoupled from inventory by design: nothing here writes on equip — the
 * rung re-derives from equipped state + bindings at resolve time.
 */
import type { Kysely, } from "kysely";
import { EquipState, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";

/** system_config key gating the equipped-loadout rung. Default off. */
export const LOADOUT_BRIDGE_FLAG = "wardrobe_loadout_bridge";

/**
 * Read the loadout-bridge flag. Absent key = off (default).
 * @param db
 * @returns true only when the flag value is exactly "true"
 */
export async function isLoadoutBridgeEnabled(db: Kysely<DB>,): Promise<boolean> {
  const row = await db
    .selectFrom("system_config",)
    .select(["value",],)
    .where("key", "=", LOADOUT_BRIDGE_FLAG,)
    .executeTakeFirst();
  return row?.value === "true";
}

/**
 * Resolve the outfit mapped from currently equipped items.
 *
 * Deterministic order: newest binding first (`created_at` desc), then
 * `id` desc as a total-order tie-break. Items that are unequipped, or
 * bindings whose instance was deleted (`item_instance_id IS NULL`),
 * never contribute.
 *
 * @param db
 * @param actorId
 * @returns The winning outfit id, or null when nothing equipped is bound
 */
export async function resolveEquippedOutfit(
  db: Kysely<DB>,
  actorId: string,
): Promise<string | null> {
  const rows = await db
    .selectFrom("actor_wardrobe",)
    .innerJoin("actor_items", "actor_items.id", "actor_wardrobe.item_instance_id",)
    .select(["actor_wardrobe.wardrobe_item_id", "actor_wardrobe.created_at", "actor_wardrobe.id",])
    .where("actor_wardrobe.actor_id", "=", actorId,)
    .where("actor_items.equipped", "=", EquipState.Equipped,)
    .orderBy("actor_wardrobe.created_at", "desc",)
    .orderBy("actor_wardrobe.id", "desc",)
    .limit(1,)
    .execute();
  return rows[0]?.wardrobe_item_id ?? null;
}
