// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Transfer helper for the Actor Items Service.
 *
 * Moves `quantity` of an item from one actor to another as a single unit:
 * source deduction + target grant are atomic. Deducts from the source row
 * and stacks onto (or creates) the target row, all inside a transaction.
 */
import type { Kysely, Transaction, } from "kysely";
import { EquipState, } from "../../db/enums";
import type { DB, } from "../../db/schema";

export interface TransferResult {
  ok: boolean;
  transferred?: number;
  reason?: string;
}

/** Move `quantity` of an item between actors, atomically. */
export async function transferItems(
  db: Kysely<DB>,
  fromActorId: string,
  toActorId: string,
  itemId: string,
  quantity: number,
  trx?: Transaction<DB>,
): Promise<TransferResult> {
  if (fromActorId === toActorId) { return { ok: false, reason: "Source and target are the same", }; }
  if (!Number.isInteger(quantity,) || quantity <= 0) {
    return { ok: false, reason: "Quantity must be a positive integer", };
  }

  const run = async (db: Kysely<DB>,): Promise<TransferResult> => {
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
  return db.transaction().execute(run,);
}
