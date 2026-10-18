// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage.ts — persistent per-location storage (chests, crates, holds).
 *
 * One container per `location_storage` row; its contents are stacked
 * `location_storage_items` rows keyed by item DEFINITION id. Stacking is the
 * point — capacity is a SUM of quantities, so 500 arrows cost the same as one
 * and the capacity check is a single aggregate rather than a row count.
 *
 * CAPACITY FAILS LOUDLY
 * ---------------------
 * A deposit that would exceed `capacity` THROWS `StorageError` with code
 * `capacity-exceeded`. It is never truncated to whatever fits and never
 * partially succeeds: a player who sees a success must be able to believe the
 * whole stack went in. Routes render the code as 409.
 *
 * WHO is checked lives in `./storage-access`. Every route-facing entry point
 * — `readStorageContents`, `depositItem`, `withdrawItem` — calls
 * `assertMayAccess` with the AUTHENTICATED actor, so no call site can forget.
 * `getStorageContents` is the raw, unguarded query and is internal only.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import {
  assertMayAccess,
  encodeAccessControl,
  type StorageAccessControl,
  StorageError,
  type StorageRow,
} from "./storage-access";

/** One stacked line of a container's contents. */
export interface StorageContent {
  itemId: string;
  quantity: number;
  storedAt: string;
}

/** How much of a container is in use, in item units. */
export interface StorageUsage {
  used: number;
  capacity: number;
  /** Units still available; never negative. */
  free: number;
}

/**
 * Load a container by id.
 * @param db Kysely handle
 * @param storageId the container to load
 * @param worldId world scope — a container in another world is not found
 * @returns the row
 * @throws {StorageError} `not-found` when no such container exists in this world
 */
async function loadStorage(db: Kysely<DB>, storageId: string, worldId: string,): Promise<StorageRow> {
  const storage = await db
    .selectFrom("location_storage",)
    .selectAll()
    .where("id", "=", storageId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!storage) { throw new StorageError("not-found", `storage "${storageId}" not found`,); }

  return storage;
}

/**
 * Create a container at a location.
 * @param db Kysely handle
 * @param input the container to create; `capacity` is in item units
 * @returns the created row
 * @throws {StorageError} `invalid-quantity` when capacity is negative — the DB
 *   check constraint would catch it, but as an opaque SQLite error
 */
export async function createStorage(
  db: Kysely<DB>,
  input: {
    worldId: string;
    locationId: string;
    name: string;
    capacity: number;
    security?: number;
    accessControl?: StorageAccessControl;
  },
): Promise<StorageRow> {
  if (!Number.isInteger(input.capacity,) || input.capacity < 0) {
    throw new StorageError("invalid-quantity", `capacity must be a non-negative integer, got ${input.capacity}`,);
  }

  const id = uid();
  await db
    .insertInto("location_storage",)
    .values({
      id,
      world_id: input.worldId,
      location_id: input.locationId,
      name: input.name,
      capacity: input.capacity,
      security: input.security ?? 0,
      access_control: encodeAccessControl(input.accessControl ?? {},),
    },)
    .execute();

  return await loadStorage(db, id, input.worldId,);
}

/**
 * List containers at a location, or across a world when no location is given.
 * @param db Kysely handle
 * @param worldId world scope
 * @param locationId optional location filter
 * @returns the matching containers, oldest first
 */
export async function listStorages(
  db: Kysely<DB>,
  worldId: string,
  locationId?: string,
): Promise<StorageRow[]> {
  const query = db.selectFrom("location_storage",).selectAll().where("world_id", "=", worldId,);
  const scoped = locationId === undefined ? query : query.where("location_id", "=", locationId,);

  return await scoped.orderBy("created_at", "asc",).execute();
}

/**
 * Read a container's stacked contents.
 *
 * UNGUARDED — internal use only. It answers "what is in here" for a caller
 * that has already established access (tests, and `readStorageContents`).
 * An authenticated route must go through `readStorageContents`, or the
 * security model is bypassed entirely.
 * @param db Kysely handle
 * @param storageId the container to read
 * @returns the stacked lines, most numerous first
 */
export async function getStorageContents(db: Kysely<DB>, storageId: string,): Promise<StorageContent[]> {
  const rows = await db
    .selectFrom("location_storage_items",)
    .select(["item_id", "quantity", "stored_at",],)
    .where("storage_id", "=", storageId,)
    .orderBy("stored_at", "asc",)
    .execute();

  return rows.map((row,) => ({ itemId: row.item_id, quantity: row.quantity, storedAt: row.stored_at, }));
}

/**
 * Read a container's contents ON BEHALF OF AN ACTOR, enforcing its rules.
 *
 * This is the read a route must use. `getStorageContents` above is the raw
 * query and is deliberately unguarded, so it is only for callers that have
 * already established access (tests, and this function). Routing an
 * authenticated read through the raw one hands every world member every
 * private chest in the world.
 * @param db Kysely handle
 * @param input the container, the AUTHENTICATED actor, and their world
 * @returns the stacked lines, oldest first
 * @throws {StorageError} `not-found` when the container does not exist,
 *   `access-denied` when the actor may not use it
 */
export async function readStorageContents(
  db: Kysely<DB>,
  input: { storageId: string; actorId: string; worldId: string },
): Promise<StorageContent[]> {
  const storage = await loadStorage(db, input.storageId, input.worldId,);
  assertMayAccess(storage, input.actorId, input.worldId,);

  return await getStorageContents(db, input.storageId,);
}

/**
 * How full a container is, in item units.
 * @param db Kysely handle
 * @param storageId the container to measure
 * @param worldId world scope — a container in another world is not found
 * @returns used, capacity, and free units
 * @throws {StorageError} `not-found` when the container does not exist
 */
export async function storageUsage(db: Kysely<DB>, storageId: string, worldId: string,): Promise<StorageUsage> {
  const storage = await loadStorage(db, storageId, worldId,);
  const totals = await db
    .selectFrom("location_storage_items",)
    .select((eb,) => eb.fn.sum("quantity",).as("used",))
    .where("storage_id", "=", storageId,)
    .executeTakeFirst();

  const used = Number(totals?.used ?? 0,);

  return { used, capacity: storage.capacity, free: Math.max(0, storage.capacity - used,), };
}

/** Re-exported so callers get the whole storage surface from one module. */
export { checkStorageAccess, readAccessControl, StorageError, } from "./storage-access";
export type { StorageAccessControl, StorageAccessRequest, StorageAccessResult, StorageRow, } from "./storage-access";
export { depositItem, withdrawItem, } from "./storage-mutations";
