// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-access.test.ts — WHO may open a container.
 *
 * Stacking and capacity are in `storage.test.ts`; this file covers the rules.
 * Every case asserts the CONTAINER STATE afterwards, not just the thrown code:
 * an `access-denied` that still moved the item would be the worse bug, and only
 * a content read catches that.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { StorageAccessDenial, } from "../db/enums-story/resources";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { checkStorageAccess, depositItem, getStorageContents, listStorages, withdrawItem, } from "./storage";
import {
  expectStorageError,
  OWNER,
  seedStorage,
  seedStorageWorld,
  STRANGER,
  WORLD,
} from "./storage-fixtures";

let db: Kysely<DB>;
let itemId = "";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  itemId = await seedStorageWorld(db,);
},);

afterEach(async () => {
  await db.destroy();
},);

/** The one container at the camp, read straight back as the access check sees it. */
async function onlyStorage() {
  const [row,] = await listStorages(db, WORLD, "loc1",);

  return row!;
}

describe("checkStorageAccess", () => {
  test("allows the owner and anyone explicitly listed", async () => {
    await seedStorage(db, { access: { ownerActorId: OWNER, allowedActorIds: [STRANGER,], }, },);
    const storage = await onlyStorage();

    expect(checkStorageAccess({ storage, actorId: OWNER, worldId: WORLD, },).allowed,).toBe(true,);
    expect(checkStorageAccess({ storage, actorId: STRANGER, worldId: WORLD, },).allowed,).toBe(true,);
  });

  test("returns a DISCRIMINATED denial, naming the reason", async () => {
    await seedStorage(db, { access: { ownerActorId: OWNER, }, },);
    const storage = await onlyStorage();

    const verdict = checkStorageAccess({ storage, actorId: STRANGER, worldId: WORLD, },);

    expect(verdict.allowed,).toBe(false,);
    expect(verdict,).toEqual({ allowed: false, reason: StorageAccessDenial.NotAllowed, },);
  });

  test("an unowned container is open to its world", async () => {
    await seedStorage(db, {},);
    const storage = await onlyStorage();

    expect(checkStorageAccess({ storage, actorId: STRANGER, worldId: WORLD, },).allowed,).toBe(true,);
  });

  test("denies an actor reaching in from another world", async () => {
    await seedStorage(db, { access: { ownerActorId: OWNER, }, },);
    const storage = await onlyStorage();

    const verdict = checkStorageAccess({ storage, actorId: OWNER, worldId: "other-world", },);

    expect(verdict,).toEqual({ allowed: false, reason: StorageAccessDenial.CrossWorld, },);
  });

  test("denies a guest when the container sits below its own security floor", async () => {
    await seedStorage(db, {
      security: 20,
      access: { ownerActorId: OWNER, allowedActorIds: [STRANGER,], requireSecurity: 50, },
    },);

    const storage = await onlyStorage();

    const verdict = checkStorageAccess({ storage, actorId: STRANGER, worldId: WORLD, },);

    expect(verdict,).toEqual({ allowed: false, reason: StorageAccessDenial.SecurityTooLow, },);
  });

  test("lets a guest in once the container meets the security floor", async () => {
    await seedStorage(db, {
      security: 80,
      access: { ownerActorId: OWNER, allowedActorIds: [STRANGER,], requireSecurity: 50, },
    },);

    const storage = await onlyStorage();

    expect(checkStorageAccess({ storage, actorId: STRANGER, worldId: WORLD, },).allowed,).toBe(true,);
  });
});

describe("access is enforced on the writes", () => {
  test("BLOCKS a withdrawal by an actor the rules exclude, leaving the pile intact", async () => {
    const storageId = await seedStorage(db, { access: { ownerActorId: OWNER, }, },);
    await depositItem(db, { storageId, itemId, quantity: 5, actorId: OWNER, worldId: WORLD, },);

    await expectStorageError(
      withdrawItem(db, { storageId, itemId, quantity: 1, actorId: STRANGER, worldId: WORLD, },),
      "access-denied",
    );

    expect((await getStorageContents(db, storageId,))[0]!.quantity,).toBe(5,);
  });

  test("blocks a deposit too — access is not only about taking", async () => {
    const storageId = await seedStorage(db, { access: { ownerActorId: OWNER, }, },);

    await expectStorageError(
      depositItem(db, { storageId, itemId, quantity: 1, actorId: STRANGER, worldId: WORLD, },),
      "access-denied",
    );

    expect(await getStorageContents(db, storageId,),).toEqual([],);
  });

  test("the owner opens their own chest whatever its security level", async () => {
    const storageId = await seedStorage(db, {
      security: 0,
      access: { ownerActorId: OWNER, requireSecurity: 90, },
    },);

    await depositItem(db, { storageId, itemId, quantity: 1, actorId: OWNER, worldId: WORLD, },);

    const usage = await withdrawItem(db, { storageId, itemId, quantity: 1, actorId: OWNER, worldId: WORLD, },);

    expect(usage.used,).toBe(0,);
  });

  test("an open container lets any actor in the world use it", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 4, actorId: OWNER, worldId: WORLD, },);

    const usage = await withdrawItem(db, {
      storageId,
      itemId,
      quantity: 1,
      actorId: STRANGER,
      worldId: WORLD,
    },);

    expect(usage.used,).toBe(3,);
  });
});
