// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { LocationNsfwService, } from "./service";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
let worldId: string;
let locationId: string;
let otherLocationId: string;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  const userId = uid();
  await insertUsers(db, `nsfw-user-${userId}`, "Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "NSFW World", { id: worldId, } as never,);
  locationId = uid();
  otherLocationId = uid();
  await insertLocations(db, worldId, "Bedroom", { id: locationId, } as never,);
  await insertLocations(db, worldId, "Tavern", { id: otherLocationId, } as never,);
},);

describe("getConfig", () => {
  test("creates a bedroom/private default for unknown locations", async () => {
    const svc = new LocationNsfwService(db,);
    const config = await svc.getConfig(locationId,);
    expect(config.locationId,).toBe(locationId,);
    expect(config.locationType,).toBe("bedroom",);
    expect(config.privacyLevel,).toBe("private",);
    expect(config.discoveryChance,).toBe(10,);
    expect(config.atmosphere,).toEqual({
      romantic: 50,
      dangerous: 0,
      comfortable: 50,
      exotic: 0,
      seedy: 0,
    },);
    expect(config.equipment,).toEqual([],);
    expect(config.risks,).toEqual({ discovery: 10, injury: 0, arrest: 0, reputation: 5, },);
    expect(typeof config.id,).toBe("string",);
  });

  test("returns the stored row on the second call", async () => {
    const svc = new LocationNsfwService(db,);
    const first = await svc.getConfig(locationId,);
    const second = await svc.getConfig(locationId,);
    expect(second.id,).toBe(first.id,);
    expect(second.createdAt,).toBe(first.createdAt,);
  });
});

describe("updateConfig", () => {
  test("updates scalar fields", async () => {
    const svc = new LocationNsfwService(db,);
    expect(
      await svc.updateConfig(locationId, {
        locationType: "tavern",
        privacyLevel: "semi_private",
        discoveryChance: 40,
        equipment: ["bed", "candles",],
      },),
    ).toBeTrue();
    const config = await svc.getConfig(locationId,);
    expect(config.locationType,).toBe("tavern",);
    expect(config.privacyLevel,).toBe("semi_private",);
    expect(config.discoveryChance,).toBe(40,);
    expect(config.equipment,).toEqual(["bed", "candles",],);
  });

  test("merges atmosphere and risks over existing values", async () => {
    const svc = new LocationNsfwService(db,);
    await svc.updateConfig(locationId, {
      atmosphere: { romantic: 90, },
      risks: { arrest: 25, },
    },);
    const config = await svc.getConfig(locationId,);
    expect(config.atmosphere.romantic,).toBe(90,);
    expect(config.atmosphere.comfortable,).toBe(50,);
    expect(config.risks.arrest,).toBe(25,);
    expect(config.risks.discovery,).toBe(10,);
  });

  test("empty update still touches updated_at and returns true", async () => {
    const svc = new LocationNsfwService(db,);
    const before = await svc.getConfig(locationId,);
    expect(await svc.updateConfig(locationId, {},),).toBeTrue();
    const after = await svc.getConfig(locationId,);
    expect(after.id,).toBe(before.id,);
  });
});

describe("getConfigs", () => {
  test("returns empty list for empty input", async () => {
    expect(await new LocationNsfwService(db,).getConfigs([],),).toEqual([],);
  });

  test("returns configs for known locations only", async () => {
    const svc = new LocationNsfwService(db,);
    await svc.getConfig(locationId,);
    const rows = await svc.getConfigs([locationId, otherLocationId, "missing",],);
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.locationId,).toBe(locationId,);
  });

  test("returns multiple configs", async () => {
    const svc = new LocationNsfwService(db,);
    await svc.getConfig(locationId,);
    await svc.getConfig(otherLocationId,);
    const rows = await svc.getConfigs([locationId, otherLocationId,],);
    expect(rows.length,).toBe(2,);
  });
});

describe("deleteConfig", () => {
  test("deletes an existing config and recreates on next get", async () => {
    const svc = new LocationNsfwService(db,);
    const created = await svc.getConfig(locationId,);
    expect(await svc.deleteConfig(locationId,),).toBeTrue();
    const recreated = await svc.getConfig(locationId,);
    expect(recreated.locationType,).toBe("bedroom",);
    expect(recreated.id === created.id,).toBeFalse();
  });

  test("returns false when nothing exists", async () => {
    expect(await new LocationNsfwService(db,).deleteConfig(locationId,),).toBeFalse();
  });
});

describe("isSuitableForEncounter", () => {
  test("private default is suitable for semi_private minimum", async () => {
    const svc = new LocationNsfwService(db,);
    expect(await svc.isSuitableForEncounter(locationId,),).toEqual({ suitable: true, },);
  });

  test("public location fails an isolated minimum with a reason", async () => {
    const svc = new LocationNsfwService(db,);
    await svc.updateConfig(locationId, { privacyLevel: "public", },);
    const result = await svc.isSuitableForEncounter(locationId, "isolated",);
    expect(result.suitable,).toBeFalse();
    expect(result.reason,).toContain("public",);
    expect(result.reason,).toContain("isolated",);
  });

  test("isolated location passes every minimum", async () => {
    const svc = new LocationNsfwService(db,);
    await svc.updateConfig(locationId, { privacyLevel: "isolated", },);
    for (const min of ["public", "semi_private", "private", "isolated",]) {
      expect((await svc.isSuitableForEncounter(locationId, min,)).suitable,).toBeTrue();
    }
  });
});
