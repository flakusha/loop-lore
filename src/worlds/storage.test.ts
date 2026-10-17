// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage.test.ts — containers, stacking, and capacity.
 *
 * The load-bearing case is `REJECTS a deposit past capacity`: capacity must be a
 * hard limit that fails loudly with a typed code, not a silent truncation to
 * whatever happens to fit. A player who sees a success has to be able to believe
 * the whole stack went in.
 *
 * That case asserts the container state AFTER the rejection, not just the thrown
 * code — a partial write that threw the right error would still be wrong.
 * `storage-access.test.ts` covers who may open a chest; both files seed through
 * `./storage-fixtures`.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  depositItem,
  getStorageContents,
  listStorages,
  storageUsage,
  withdrawItem,
} from "./storage";
import { encodeAccessControl, } from "./storage-access";
import {
  expectStorageError,
  LOCATION,
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

describe("createStorage / listStorages", () => {
  test("creates a container and lists it by location", async () => {
    const id = await seedStorage(db, { capacity: 50, },);

    const list = await listStorages(db, WORLD, LOCATION,);

    expect(list,).toHaveLength(1,);
    expect(list[0]!.id,).toBe(id,);
    expect(list[0]!.capacity,).toBe(50,);
  });

  test("round-trips access_control through its JSON encoding", async () => {
    const id = await seedStorage(db, {
      access: { ownerActorId: OWNER, allowedActorIds: [STRANGER,], requireSecurity: 10, },
    },);

    const [row,] = await listStorages(db, WORLD, LOCATION,);
    expect(row!.id,).toBe(id,);

    const stored = await db
      .selectFrom("location_storage",)
      .select(["access_control",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();

    expect(JSON.parse(stored.access_control,),).toEqual({
      ownerActorId: OWNER,
      allowedActorIds: [STRANGER,],
      requireSecurity: 10,
    },);

    expect(encodeAccessControl({},),).toBe("{}",);
  });
});

describe("depositItem", () => {
  test("stacks onto an existing pile rather than adding a second row", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);

    await depositItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },);
    await depositItem(db, { storageId, itemId, quantity: 15, actorId: OWNER, worldId: WORLD, },);

    const contents = await getStorageContents(db, storageId,);
    expect(contents,).toHaveLength(1,);
    expect(contents[0]!.quantity,).toBe(25,);
  });

  test("counts capacity in UNITS, so many items fill a chest faster than few", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);

    const usage = await depositItem(db, {
      storageId,
      itemId,
      quantity: 40,
      actorId: OWNER,
      worldId: WORLD,
    },);

    expect(usage.used,).toBe(40,);
    expect(usage.free,).toBe(60,);
  });

  test("REJECTS a deposit past capacity with a typed error, never truncating", async () => {
    const storageId = await seedStorage(db, { capacity: 10, },);
    await depositItem(db, { storageId, itemId, quantity: 8, actorId: OWNER, worldId: WORLD, },);

    await expectStorageError(
      depositItem(db, { storageId, itemId, quantity: 5, actorId: OWNER, worldId: WORLD, },),
      "capacity-exceeded",
    );

    // The refused deposit must leave nothing behind — no partial stack.
    const contents = await getStorageContents(db, storageId,);
    expect(contents[0]!.quantity,).toBe(8,);
    expect((await storageUsage(db, storageId,)).used,).toBe(8,);
  });

  test("rejects a non-positive-integer quantity before touching the DB", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);

    await expectStorageError(
      depositItem(db, { storageId, itemId, quantity: 0, actorId: OWNER, worldId: WORLD, },),
      "invalid-quantity",
    );

    await expectStorageError(
      depositItem(db, { storageId, itemId, quantity: -3, actorId: OWNER, worldId: WORLD, },),
      "invalid-quantity",
    );

    await expectStorageError(
      depositItem(db, { storageId, itemId, quantity: 1.5, actorId: OWNER, worldId: WORLD, },),
      "invalid-quantity",
    );
  });

  test("rejects a deposit into a container that does not exist", async () => {
    await expectStorageError(
      depositItem(db, { storageId: "nope", itemId, quantity: 1, actorId: OWNER, worldId: WORLD, },),
      "not-found",
    );
  });
});

describe("withdrawItem", () => {
  test("removes the units and deletes the row when the pile empties", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 12, actorId: OWNER, worldId: WORLD, },);

    const usage = await withdrawItem(db, {
      storageId,
      itemId,
      quantity: 12,
      actorId: OWNER,
      worldId: WORLD,
    },);

    expect(usage.used,).toBe(0,);
    expect(await getStorageContents(db, storageId,),).toEqual([],);
  });

  test("leaves the remainder when only part of the pile is taken", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 12, actorId: OWNER, worldId: WORLD, },);

    await withdrawItem(db, { storageId, itemId, quantity: 5, actorId: OWNER, worldId: WORLD, },);

    expect((await getStorageContents(db, storageId,))[0]!.quantity,).toBe(7,);
  });

  test("rejects taking more than is stored", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 3, actorId: OWNER, worldId: WORLD, },);

    await expectStorageError(
      withdrawItem(db, { storageId, itemId, quantity: 4, actorId: OWNER, worldId: WORLD, },),
      "insufficient-quantity",
    );

    expect((await getStorageContents(db, storageId,))[0]!.quantity,).toBe(3,);
  });
});
