// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Items Service
 *
 * Gameplay logic over `actor_items`: equip/unequip with slot-conflict and
 * requirement checks, weight capacity (from actor `settings.strength`),
 * and transfer between actors.
 *
 * Actor items are simple rows (no FK to `items` definitions) — their
 * category/rarity live inline on the row. Equip slot is derived from
 * `item_type` (ItemCategory): `weapon` → weapon slot, `armor` → body,
 * everything else → accessory.
 */
import type { Kysely, Transaction, } from "kysely";
import { EquipState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { jsonParseOr, } from "../utils";
import {
  type CarryStatus,
  ENCUMBRANCE,
  type Encumbrance,
  type EquipResult,
  slotForCategory,
} from "./actor-items/equip";
export {
  ENCUMBRANCE,
  EQUIP_SLOTS,
  slotForCategory,
} from "./actor-items/equip";
export type {
  CarryStatus,
  Encumbrance,
  EquipResult,
  EquipSlot,
} from "./actor-items/equip";
export class ActorItemsService {
  private readonly db: Kysely<DB>;
  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  // ── Capacity ────────────────────────────────────────────

  /** Base carry weight: 50 lb + STR×10 (STR defaults to 10). */
  private async capacityFor(actorId: string,): Promise<number> {
    const actor = await this.db
      .selectFrom("actors",)
      .select("settings",)
      .where("id", "=", actorId,)
      .executeTakeFirst();
    const settings = jsonParseOr<{ strength?: number }>(actor?.settings ?? "{}", {},);
    const str = Math.max(1, Math.min(30, Number(settings.strength,) || 10,),);
    return 50 + str * 10;
  }

  /** Sum of weight × quantity carried. */
  async getCarriedWeight(actorId: string,): Promise<number> {
    const rows = await this.db
      .selectFrom("actor_items",)
      .select(["weight", "quantity",],)
      .where("actor_id", "=", actorId,)
      .execute();
    let total = 0;
    for (const r of rows) {
      total += (r.weight ?? 0) * r.quantity;
    }
    return total;
  }

  /** Current load vs capacity + encumbrance level. */
  async getCarryStatus(actorId: string,): Promise<CarryStatus> {
    const [carriedResult, capacityResult,] = await Promise.allSettled([
      this.getCarriedWeight(actorId,),
      this.capacityFor(actorId,),
    ],);
    if (carriedResult.status === "rejected") { throw carriedResult.reason; }
    if (capacityResult.status === "rejected") { throw capacityResult.reason; }
    const carried = carriedResult.value;
    const capacity = capacityResult.value;
    const ratio = capacity > 0 ? carried / capacity : 1;
    const encumbrance: Encumbrance = ratio < 0.8
      ? ENCUMBRANCE.Light
      : (ratio <= 1
        ? ENCUMBRANCE.Medium
        : ENCUMBRANCE.Overloaded);
    const threshold = encumbrance === ENCUMBRANCE.Light ? Math.floor(capacity * 0.8,) : capacity;
    return {
      carried,
      capacity,
      encumbrance,
      canCarry: (additional,) => carried + additional <= threshold,
    };
  }

  // ── Equip / Unequip ─────────────────────────────────────

  private async getItem(actorId: string, itemId: string,) {
    return this.db
      .selectFrom("actor_items",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("id", "=", itemId,)
      .executeTakeFirst();
  }

  /** Equip an item, validating slot conflict. Dual-wield not supported. */
  async equip(actorId: string, itemId: string,): Promise<EquipResult> {
    const item = await this.getItem(actorId, itemId,);
    if (!item) { return { ok: false, reason: "Item not found", }; }

    const slot = slotForCategory(item.item_type,);
    if (!slot) { return { ok: false, itemId, reason: "Item cannot be equipped", }; }

    // Reject a second item in the same slot (allow multiple accessories
    // via a per-item accessory flag? No — keep one-per-slot for now).
    const conflict = await this.db
      .selectFrom("actor_items",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("equipped", "=", EquipState.Equipped,)
      .where("id", "!=", itemId,)
      .where("item_type", "=", item.item_type,)
      .executeTakeFirst();
    if (conflict) {
      return { ok: false, itemId, reason: `Another ${slot} is already equipped`, };
    }

    await this.db
      .updateTable("actor_items",)
      .set({ equipped: EquipState.Equipped, },)
      .where("id", "=", itemId,)
      .execute();
    return { ok: true, itemId, };
  }

  /** Unequip an item. */
  async unequip(actorId: string, itemId: string,): Promise<EquipResult> {
    const item = await this.getItem(actorId, itemId,);
    if (!item) { return { ok: false, reason: "Item not found", }; }
    await this.db
      .updateTable("actor_items",)
      .set({ equipped: EquipState.Unequipped, },)
      .where("id", "=", itemId,)
      .execute();
    return { ok: true, itemId, };
  }

  /** List all equipped items. */
  async getEquipped(actorId: string,) {
    return this.db
      .selectFrom("actor_items",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("equipped", "=", EquipState.Equipped,)
      .execute();
  }

  // ── Transfer ────────────────────────────────────────────

  /**
   * Move `quantity` of an item from one actor to another.
   * Deducts from source; creates (or stacks onto) the target row.
   * Uses a transaction so source deduction + target grant are atomic.
   */
  async transfer(
    fromActorId: string,
    toActorId: string,
    itemId: string,
    quantity: number,
    trx?: Transaction<DB>,
  ): Promise<{ ok: boolean; transferred?: number; reason?: string }> {
    if (fromActorId === toActorId) { return { ok: false, reason: "Source and target are the same", }; }
    if (!Number.isInteger(quantity,) || quantity <= 0) {
      return { ok: false, reason: "Quantity must be a positive integer", };
    }

    const run = async (db: Kysely<DB>,): Promise<{ ok: boolean; transferred?: number; reason?: string }> => {
      const source = await db
        .selectFrom("actor_items",)
        .select([
          "id",
          "quantity",
          "name",
          "description",
          "item_type",
          "value",
          "weight",
          "tags",
          "metadata",
          "sort_order",
        ],)
        .where("actor_id", "=", fromActorId,)
        .where("id", "=", itemId,)
        .executeTakeFirst();
      if (!source) { return { ok: false, reason: "Source item not found", }; }
      if (source.quantity < quantity) { return { ok: false, reason: "Insufficient quantity", }; }

      const remaining = source.quantity - quantity;
      if (remaining === 0) {
        await db.deleteFrom("actor_items",).where("id", "=", itemId,).execute();
      } else {
        await db
          .updateTable("actor_items",)
          .set({ quantity: remaining, },)
          .where("id", "=", itemId,)
          .execute();
      }

      // Stack onto an existing identical target item, else insert.
      const existing = await db
        .selectFrom("actor_items",)
        .select("id",)
        .where("actor_id", "=", toActorId,)
        .where("name", "=", source.name,)
        .where("item_type", "=", source.item_type,)
        .executeTakeFirst();
      if (existing) {
        await db
          .updateTable("actor_items",)
          .set((eb,) => ({ quantity: eb("quantity", "+", quantity,), }))
          .where("id", "=", existing.id,)
          .execute();
      } else {
        await db
          .insertInto("actor_items",)
          .values({
            id: crypto.randomUUID(),
            actor_id: toActorId,
            name: source.name,
            description: source.description,
            item_type: source.item_type,
            quantity,
            value: source.value,
            weight: source.weight,
            tags: source.tags,
            metadata: source.metadata,
            sort_order: source.sort_order,
            equipped: EquipState.Unequipped,
          },)
          .execute();
      }

      return { ok: true, transferred: quantity, };
    };

    if (trx) { return run(trx,); }
    return this.db.transaction().execute(run,);
  }
}
