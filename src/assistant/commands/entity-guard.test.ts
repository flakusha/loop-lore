// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * entity-guard tests — owner allow, stranger deny, missing deny for the
 * world / location / item / character ownership guards.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { requireOwnedCharacter, requireOwnedWorld, requireOwnedWorldEntity, } from "./entity-guard";

let fixture: TestDb | undefined;
let db: Kysely<DB>;
let ownerId: string;
let strangerId: string;
let worldId: string;
let locationId: string;
let itemId: string;
let actorId: string;

async function seed(): Promise<void> {
  fixture = await createTestDb();
  db = fixture.db;
  ownerId = await insertUsers(db, "guard-owner", "Guard Owner",);
  strangerId = await insertUsers(db, "guard-stranger", "Guard Stranger",);
  worldId = await insertWorlds(db, ownerId, "Guard World",);
  locationId = await insertLocations(db, worldId, "Guard Hollow",);
  itemId = await insertItems(db, worldId, "Guard Blade", ItemCategory.Weapon,);
  actorId = await insertActors(db, "Guard Hero", { owner_id: ownerId, },);
}

async function teardown(): Promise<void> {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
}

describe("requireOwnedWorldEntity", () => {
  test("owner loads each kind with its world scope", async () => {
    await seed();
    try {
      const world = await requireOwnedWorldEntity(db, "world", worldId, ownerId, null,);
      const location = await requireOwnedWorldEntity(db, "location", locationId, ownerId, null,);
      const item = await requireOwnedWorldEntity(db, "item", itemId, ownerId, null,);

      for (const result of [world, location, item,]) {
        expect(result.ok,).toBe(true,);
        if (!result.ok) { throw new Error("owner should be allowed",); }
        expect(result.scope.worldId,).toBe(worldId,);
      }
    } finally {
      await teardown();
    }
  });

  test("stranger and missing ids get the same denial shape", async () => {
    await seed();
    try {
      const cases = [
        await requireOwnedWorldEntity(db, "world", worldId, strangerId, null,),
        await requireOwnedWorldEntity(db, "location", locationId, strangerId, null,),
        await requireOwnedWorldEntity(db, "item", itemId, strangerId, null,),
        await requireOwnedWorldEntity(db, "world", "no-such-world", ownerId, null,),
        await requireOwnedWorldEntity(db, "location", "no-such-location", ownerId, null,),
        await requireOwnedWorldEntity(db, "item", "no-such-item", ownerId, null,),
        await requireOwnedWorldEntity(db, "world", worldId, null, null,),
      ];

      for (const result of cases) {
        expect(result.ok,).toBe(false,);
        if (result.ok) { throw new Error("should be denied",); }
        expect(result.message,).toContain("not found or not owned",);
      }
    } finally {
      await teardown();
    }
  });
});

describe("requireOwnedWorld", () => {
  test("owner passes both kinds; stranger fails both", async () => {
    await seed();
    try {
      expect((await requireOwnedWorld(db, worldId, "location", ownerId, null,)).ok,).toBe(true,);
      expect((await requireOwnedWorld(db, worldId, "item", ownerId, null,)).ok,).toBe(true,);
      expect((await requireOwnedWorld(db, worldId, "location", strangerId, null,)).ok,).toBe(false,);
      expect((await requireOwnedWorld(db, worldId, "item", strangerId, null,)).ok,).toBe(false,);
      expect((await requireOwnedWorld(db, "no-such-world", "item", ownerId, null,)).ok,).toBe(false,);
    } finally {
      await teardown();
    }
  });
});

describe("requireOwnedCharacter", () => {
  test("owner loads the character fields", async () => {
    await seed();
    try {
      const result = await requireOwnedCharacter(db, actorId, ownerId, null,);
      expect(result.ok,).toBe(true,);
      if (!result.ok) { throw new Error("owner should be allowed",); }
      expect(result.character.name,).toBe("Guard Hero",);
    } finally {
      await teardown();
    }
  });

  test("stranger, missing actor, and logged-out caller are denied", async () => {
    await seed();
    try {
      for (
        const args of [
          [actorId, strangerId,],
          ["no-such-actor", ownerId,],
          [actorId, null,],
        ] as Array<[string, string | null,]>
      ) {
        const result = await requireOwnedCharacter(db, args[0], args[1], null,);
        expect(result.ok,).toBe(false,);
        if (result.ok) { throw new Error("should be denied",); }
        expect(result.message,).toContain("not found or not owned",);
      }
    } finally {
      await teardown();
    }
  });
});
