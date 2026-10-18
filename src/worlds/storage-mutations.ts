// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-mutations.ts — the two WRITES on a container.
 *
 * Split from `./storage` for size. Both functions here share the same three
 * guards in the same order — validate the quantity, load the container, check
 * access — and neither may be called with one skipped.
 *
 * Both are CONCURRENCY-SAFE by construction: the deposit's capacity check and
 * write share one transaction, and the withdrawal's decrement is a guarded
 * conditional update. Neither relies on an earlier read staying true.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import { type StorageUsage, storageUsage, } from "./storage";
import { assertMayAccess, StorageError, type StorageRow, } from "./storage-access";

/**
 * Load a container, or fail.
 * @param db Kysely handle
 * @param storageId the container to load
 * @returns the row
 * @throws {StorageError} `not-found` when it does not exist
 */
async function loadStorage(db: Kysely<DB>, storageId: string,): Promise<StorageRow> {
  const storage = await db
    .selectFrom("location_storage",)
    .selectAll()
    .where("id", "=", storageId,)
    .executeTakeFirst();

  if (!storage) { throw new StorageError("not-found", `storage "${storageId}" not found`,); }

  return storage;
}

/**
 * Read the id of the stacked line for one item in a container.
 *
 * Only the ID is returned. The quantity is deliberately NOT loaded here: a
 * withdrawal must derive the new quantity inside the guarded UPDATE, because a
 * value read earlier is stale by the time the write lands.
 */
async function loadStackId(db: Kysely<DB>, storageId: string, itemId: string,): Promise<string | undefined> {
  const stack = await db
    .selectFrom("location_storage_items",)
    .select("id",)
    .where("storage_id", "=", storageId,)
    .where("item_id", "=", itemId,)
    .executeTakeFirst();

  return stack?.id;
}

/** Reject a quantity that is not a positive integer. Without this a zero or
 * negative stack would reach SQLite and trip
 * `ck_location_storage_items_quantity` as an opaque constraint error instead of
 * a typed one the caller can act on.
 * @throws {StorageError} "invalid-quantity" when quantity is not a positive integer */
function assertQuantity(quantity: number,): void {
  if (!Number.isInteger(quantity,) || quantity <= 0) {
    throw new StorageError("invalid-quantity", `quantity must be a positive integer, got ${quantity}`,);
  }
}

/**
 * Put units of an item into a container, stacking onto any existing pile.
 *
 * CAPACITY FAILS LOUDLY: a stack that does not fit is refused whole. It is
 * never truncated to whatever space remains, because a caller that sees a
 * success must be able to believe the entire deposit landed.
 *
 * ATOMICITY: the usage read, the capacity comparison, and the write run inside
 * ONE `db.transaction()`. Without it the check is separated from the write by
 * an await, and two concurrent deposits into a nearly-full container both
 * observe the same free space and both land, overshooting `capacity`.
 *
 * @param db Kysely handle
 * @param input the container, item, and how many units
 * @returns the container's usage after the deposit
 * @throws {StorageError} `not-found` when the container is gone,
 *   `access-denied` when the actor may not use it, `invalid-quantity` for a
 *   non-positive-integer quantity, `capacity-exceeded` when the stack does not fit
 */
export async function depositItem(
  db: Kysely<DB>,
  input: { storageId: string; itemId: string; quantity: number; actorId: string; worldId: string },
): Promise<StorageUsage> {
  assertQuantity(input.quantity,);
  const storage = await loadStorage(db, input.storageId,);
  assertMayAccess(storage, input.actorId, input.worldId,);

  await db.transaction().execute(async (trx,) => {
    const usage = await storageUsage(trx, input.storageId,);
    if (usage.used + input.quantity > usage.capacity) {
      throw new StorageError(
        "capacity-exceeded",
        `storage "${input.storageId}" holds ${usage.used}/${usage.capacity} units; ` +
          `${input.quantity} more does not fit`,
      );
    }

    const stackId = await loadStackId(trx, input.storageId, input.itemId,);
    if (stackId) {
      await trx
        .updateTable("location_storage_items",)
        .set({ quantity: sql`quantity + ${input.quantity}`, },)
        .where("id", "=", stackId,)
        .execute();
    } else {
      await trx
        .insertInto("location_storage_items",)
        .values({ id: uid(), storage_id: input.storageId, item_id: input.itemId, quantity: input.quantity, },)
        .execute();
    }
  },);

  getLogger().debug("deposited into storage", {
    storageId: input.storageId,
    itemId: input.itemId,
    quantity: input.quantity,
  },);

  return await storageUsage(db, input.storageId,);
}

/**
 * Take units of an item out of a container, deleting the line when it empties.
 *
 * A withdrawal is all-or-nothing too: asking for more than the pile holds
 * raises `insufficient-quantity` rather than quietly taking whatever is there.
 *
 * CONSERVATION: the withdrawal is ONE guarded statement, never an absolute
 * write of a value derived from a prior read. Reading the pile, computing
 * `left = quantity - ?`, and writing that lets two concurrent withdrawals both
 * read 10 and both write 0, handing out 20 units from a pile of 10 — items
 * created from nothing, which is not a bounded consequence but the bug.
 *
 * Two guarded statements, because `ck_location_storage_items_quantity` forbids
 * a stored 0: a partial withdrawal decrements (`WHERE id = ? AND quantity > ?`,
 * whose result is therefore always ≥ 1), and a withdrawal that takes the whole
 * remaining pile DELETEs the line (`WHERE id = ? AND quantity = ?`, removing
 * exactly the requested amount).
 *
 * The guards PARTITION the range rather than overlap — `> n` and `= n` — which
 * is what makes the pair safe under concurrency: no statement can drive the row
 * to 0, and a caller that matches neither has genuinely lost the race. Both
 * tests read the row's CURRENT value, so a losing caller never acts on a
 * quantity it read earlier. Every ordering constraint here was found by a test,
 * not by reasoning: `>=` on the UPDATE let a second concurrent partial write 0
 * and raise an opaque CHECK error, and DELETE-first stranded a caller whose
 * equality test had already run against the pre-decrement pile.
 *
 * Either way the row's own value decides the outcome — a losing concurrent call
 * updates and deletes zero rows rather than taking a partial haul.
 *
 * @param db Kysely handle
 * @param input the container, item, and how many units
 * @returns the container's usage after the withdrawal
 * @throws {StorageError} `not-found` when the container is gone,
 *   `access-denied` when the actor may not use it, `invalid-quantity` for a
 *   non-positive-integer quantity, `insufficient-quantity` when the pile holds
 *   fewer units than requested — never a partial withdrawal
 */
export async function withdrawItem(
  db: Kysely<DB>,
  input: { storageId: string; itemId: string; quantity: number; actorId: string; worldId: string },
): Promise<StorageUsage> {
  assertQuantity(input.quantity,);
  const storage = await loadStorage(db, input.storageId,);
  assertMayAccess(storage, input.actorId, input.worldId,);

  const stackId = await loadStackId(db, input.storageId, input.itemId,);
  if (!stackId) {
    throw new StorageError("insufficient-quantity", `storage "${input.storageId}" holds no "${input.itemId}"`,);
  }

  // The two guards PARTITION the range: the UPDATE owns `quantity > n` and can
  // never write 0 (the CHECK forbids it), the DELETE owns `quantity = n`. The
  // UPDATE goes FIRST so a partial withdrawal claims its units before an
  // emptying one can test equality; a caller that loses the race falls through
  // to the DELETE, which now sees whatever the winner actually left and matches
  // when that is exactly the requested amount. DELETE-first would strand that
  // caller: its equality test would have run against the pre-decrement pile.
  const decremented = await db
    .updateTable("location_storage_items",)
    .set({ quantity: sql`quantity - ${input.quantity}`, },)
    .where("id", "=", stackId,)
    .where("quantity", ">", input.quantity,)
    .executeTakeFirst();

  if (Number(decremented?.numUpdatedRows ?? 0,) === 0) {
    const emptied = await db
      .deleteFrom("location_storage_items",)
      .where("id", "=", stackId,)
      .where("quantity", "=", input.quantity,)
      .executeTakeFirst();

    if (Number(emptied?.numDeletedRows ?? 0,) === 0) {
      throw new StorageError(
        "insufficient-quantity",
        `storage "${input.storageId}" holds fewer than ${input.quantity} of "${input.itemId}"`,
      );
    }
  }

  return await storageUsage(db, input.storageId,);
}
