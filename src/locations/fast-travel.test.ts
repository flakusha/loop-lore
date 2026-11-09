// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fast-travel unlock gate tests (`src/locations/fast-travel.ts`).
 *
 * Parallel-safety: file-scoped random UUIDs, no shared module state, so
 * tests are order-independent and safe beside other files.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertLocationDiscovery,
  insertLocationEdges,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { isFastTravelLocked, } from "./fast-travel";

describe("isFastTravelLocked", () => {
  test("open destination without gated edges travels freely", async () => {
    const { db, } = await createTestDb();
    try {
      const userId = randomUUID();
      await insertUsers(db, `u-${userId}`, "U", { id: userId, } as never,);
      const worldId = randomUUID();
      await insertWorlds(db, userId, "W", { id: worldId, } as never,);
      const dest = await insertLocations(db, worldId, "Open",);

      expect(
        await isFastTravelLocked(db as Kysely<DB>, {
          worldId,
          destinationId: dest,
          userId,
          isPrivileged: false,
        },),
      ).toBe(false,);
    } finally {
      await db.destroy();
    }
  });

  test("gated destination without a latch is locked", async () => {
    const { db, } = await createTestDb();
    try {
      const ownerId = randomUUID();
      const userId = randomUUID();
      await insertUsers(db, `o-${ownerId}`, "O", { id: ownerId, } as never,);
      await insertUsers(db, `u-${userId}`, "U", { id: userId, } as never,);
      const worldId = randomUUID();
      await insertWorlds(db, ownerId, "W", { id: worldId, } as never,);
      const from = await insertLocations(db, worldId, "From",);
      const dest = await insertLocations(db, worldId, "Gated",);
      await insertLocationEdges(db, worldId, from, dest, { mode: "walk", requires_discovery: 1, },);
      await insertActors(db, "Player", { id: randomUUID(), user_id: userId, owner_id: userId, } as never,);

      expect(
        await isFastTravelLocked(db as Kysely<DB>, {
          worldId,
          destinationId: dest,
          userId,
          isPrivileged: false,
        },),
      ).toBe(true,);
    } finally {
      await db.destroy();
    }
  });

  test("gated destination with a latch is unlocked", async () => {
    const { db, } = await createTestDb();
    try {
      const ownerId = randomUUID();
      const userId = randomUUID();
      await insertUsers(db, `o-${ownerId}`, "O", { id: ownerId, } as never,);
      await insertUsers(db, `u-${userId}`, "U", { id: userId, } as never,);
      const worldId = randomUUID();
      await insertWorlds(db, ownerId, "W", { id: worldId, } as never,);
      const from = await insertLocations(db, worldId, "From",);
      const dest = await insertLocations(db, worldId, "Gated",);
      await insertLocationEdges(db, worldId, from, dest, { mode: "walk", requires_discovery: 1, },);
      const actorId = await insertActors(db, "Player", {
        id: randomUUID(),
        user_id: userId,
        owner_id: userId,
      } as never,);

      await insertLocationDiscovery(db, worldId, dest, actorId, { discovered: 1, },);

      expect(
        await isFastTravelLocked(db as Kysely<DB>, {
          worldId,
          destinationId: dest,
          userId,
          isPrivileged: false,
        },),
      ).toBe(false,);
    } finally {
      await db.destroy();
    }
  });

  test("privileged callers bypass the gate", async () => {
    const { db, } = await createTestDb();
    try {
      const ownerId = randomUUID();
      await insertUsers(db, `o-${ownerId}`, "O", { id: ownerId, } as never,);
      const worldId = randomUUID();
      await insertWorlds(db, ownerId, "W", { id: worldId, } as never,);
      const from = await insertLocations(db, worldId, "From",);
      const dest = await insertLocations(db, worldId, "Gated",);
      await insertLocationEdges(db, worldId, from, dest, { mode: "walk", requires_discovery: 1, },);

      expect(
        await isFastTravelLocked(db as Kysely<DB>, {
          worldId,
          destinationId: dest,
          userId: ownerId,
          isPrivileged: true,
        },),
      ).toBe(false,);
    } finally {
      await db.destroy();
    }
  });
});
