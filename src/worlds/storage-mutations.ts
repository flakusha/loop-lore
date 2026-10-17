// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-mutations.ts — the two WRITES on a container.
 *
 * Split from `./storage` for size. Both functions here share the same three
 * guards in the same order — validate the quantity, load the container, check
 * access — and neither may be called with one skipped.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import { type StorageUsage, storageUsage, } from "./storage";
import { checkStorageAccess, StorageError, type StorageRow, } from "./storage-access";

/** One line of a container's contents. */
interface StackedItem {
  id: string;
  quantity: number;
}

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

/** Read the stacked line for one item in a container. */
async function loadStack(
  db: Kysely<DB>,
  storageId: string,
  itemId: string,
): Promise<StackedItem | undefined> {
  return await db
    .selectFrom("location_storage_items",)
    .select(["id", "quantity",],)
    .where("storage_id", "=", storageId,)
    .where("item_id", "=", itemId,)
    .executeTakeFirst();
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

/** Enforce access. Every mutation runs this, so an authz decision can never be
 * quietly skipped at a call site — the withdrawal path in particular must not
 * be reachable without it.
 * @throws {StorageError} "access-denied" when the actor may not use the container */
function assertMayAccess(storage: StorageRow, actorId: string, worldId: string,): void {
  const verdict = checkStorageAccess({ storage, actorId, worldId, },);
  if (!verdict.allowed) {
    throw new StorageError(
      "access-denied",
      `actor "${actorId}" may not use storage "${storage.id}" (${verdict.reason})`,
    );
  }
}

/**
 * Put units of an item into a container, stacking onto any existing pile.
 *
 * CAPACITY FAILS LOUDLY: a stack that does not fit is refused whole. It is
 * never truncated to whatever space remains, because a caller that sees a
 * success must be able to believe the entire deposit landed.
 *
 * ATOMICITY: the capacity check and the write are separated by a read, so two
 * concurrent deposits into a nearly-full container can both observe the same
 * free space and both write, overshooting `capacity`. SQLite serializes writers
 * so the window is real but narrow; closing it needs a per-storage reservation
 * the schema does not carry. The consequence is bounded — an over-full chest,
 * never a lost item — and is stated here rather than left to be discovered.
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

  const usage = await storageUsage(db, input.storageId,);
  if (usage.used + input.quantity > usage.capacity) {
    throw new StorageError(
      "capacity-exceeded",
      `storage "${input.storageId}" holds ${usage.used}/${usage.capacity} units; ` +
        `${input.quantity} more does not fit`,
    );
  }

  const existing = await loadStack(db, input.storageId, input.itemId,);
  if (existing) {
    await db
      .updateTable("location_storage_items",)
      .set({ quantity: sql`quantity + ${input.quantity}`, },)
      .where("id", "=", existing.id,)
      .execute();
  } else {
    await db
      .insertInto("location_storage_items",)
      .values({ id: uid(), storage_id: input.storageId, item_id: input.itemId, quantity: input.quantity, },)
      .execute();
  }

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

  const existing = await loadStack(db, input.storageId, input.itemId,);
  if (!existing) {
    throw new StorageError("insufficient-quantity", `storage "${input.storageId}" holds no "${input.itemId}"`,);
  }

  if (existing.quantity < input.quantity) {
    throw new StorageError(
      "insufficient-quantity",
      `storage "${input.storageId}" holds ${existing.quantity} of "${input.itemId}"; ` +
        `${input.quantity} requested`,
    );
  }

  const left = existing.quantity - input.quantity;
  if (left === 0) {
    await db.deleteFrom("location_storage_items",).where("id", "=", existing.id,).execute();
  } else {
    await db
      .updateTable("location_storage_items",)
      .set({ quantity: left, },)
      .where("id", "=", existing.id,)
      .execute();
  }

  return await storageUsage(db, input.storageId,);
}
