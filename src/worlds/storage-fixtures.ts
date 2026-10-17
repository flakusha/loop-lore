// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-fixtures.ts — shared scaffolding for the container tests.
 *
 * Split out so `storage.test.ts` (stacking and capacity) and
 * `storage-access.test.ts` (the rules) each stay under the size gate while
 * building the SAME chest. One seed helper means a fixture change cannot make
 * the two files disagree about what a container looks like.
 */
import { expect, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../db/enums";
import type { DB, } from "../db/schema";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { createStorage, StorageError, } from "./storage";
import { type StorageAccessControl, } from "./storage-access";

export const WORLD = "w1";
export const LOCATION = "loc1";
export const OWNER = "actor-owner";
export const STRANGER = "actor-stranger";

/** One user, world, location, two actors, and one item — the whole cast. */
export async function seedStorageWorld(db: Kysely<DB>,): Promise<string> {
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: WORLD, },);
  await insertLocations(db, WORLD, "Camp", { id: LOCATION, },);
  await insertActors(db, "Owner", { id: OWNER, },);
  await insertActors(db, "Stranger", { id: STRANGER, },);
  return await insertItems(db, WORLD, "Arrows", ItemCategory.Consumable,);
}

/** A chest owned by OWNER at the camp, with the given capacity and rules. */
export async function seedStorage(
  db: Kysely<DB>,
  overrides: { capacity?: number; security?: number; access?: StorageAccessControl } = {},
): Promise<string> {
  const created = await createStorage(db, {
    worldId: WORLD,
    locationId: LOCATION,
    name: "Chest",
    capacity: overrides.capacity ?? 100,
    security: overrides.security ?? 0,
    accessControl: overrides.access,
  },);

  return created.id;
}

/** Assert a promise rejects with a StorageError carrying exactly `code`. */
export async function expectStorageError(
  promise: Promise<unknown>,
  code: StorageError["code"],
): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown,) => caught,
  );

  expect(error,).toBeInstanceOf(StorageError,);
  expect((error as StorageError).code,).toBe(code,);
}
