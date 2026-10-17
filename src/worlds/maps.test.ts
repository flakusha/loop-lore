// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/maps.test.ts — 2D/3D map data model (063).
 *
 * The point-resolve cases test EACH boundary edge on its own (x0, x1, y0,
 * y1) because an off-by-one in any one of them still passes a centre-point
 * test. The anchor cases prove the zone/location link survives a re-list,
 * which is the only way a caller reads it back.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MapType, ZoneType, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertLocations, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import {
  anchorZoneToLocation,
  createMap,
  listMaps,
  listZones,
  MapError,
  resolveZoneAtPoint,
  upsertZone,
} from "./maps";

let db: Kysely<DB>;

/** The rectangle every boundary case is measured against. */
const ZONE = { x: 10, y: 20, width: 5, height: 4, } as const;

/** Inclusive edges of ZONE: x0=10, x1=14, y0=20, y1=23. */
const EDGES = { x0: 10, x1: 14, y0: 20, y1: 23, } as const;

let mapId: string;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  const map = await createMap(db, "w1", { name: "Overworld", width: 100, height: 100, },);
  mapId = map.id;
},);

afterEach(async () => {
  await db.destroy();
},);

/** Create the shared rectangle on the current map at layer 0. */
async function seedZone() {
  return await upsertZone(db, { mapId, input: { name: "Vale", ...ZONE, zoneType: ZoneType.Region, }, },);
}

describe("createMap / listMaps", () => {
  test("defaults to a 2d surface", async () => {
    expect((await listMaps(db, "w1",))[0]?.map_type,).toBe(MapType.TwoD,);
  });

  test("creates a 3d surface", async () => {
    const map = await createMap(db, "w1", {
      name: "Dungeon",
      mapType: MapType.ThreeD,
      width: 20,
      height: 20,
    },);

    expect(map.map_type,).toBe(MapType.ThreeD,);
    expect((await listMaps(db, "w1",)).length,).toBe(2,);
  });

  test("rejects a degenerate extent", async () => {
    await expect(createMap(db, "w1", { name: "Bad", width: 0, height: 5, },),).rejects.toBeInstanceOf(
      MapError,
    );
  });

  test("lists only the requested world's maps", async () => {
    await insertWorlds(db, "user-owner", "Other World", { id: "w2", },);
    await createMap(db, "w2", { name: "Elsewhere", width: 5, height: 5, },);
    expect((await listMaps(db, "w1",)).length,).toBe(1,);
  });
});

describe("upsertZone / listZones", () => {
  test("creates a zone with metadata decoded", async () => {
    const zone = await upsertZone(db, {
      mapId,
      input: { name: "Keep", ...ZONE, metadata: { biome: "temperate", }, },
    },);

    expect(zone.zoneType,).toBe(ZoneType.Region,);
    expect(zone.z,).toBe(0,);
    expect(zone.metadata,).toEqual({ biome: "temperate", },);
    expect(zone.locationId,).toBeNull();
  });

  test("replacing a zone rewrites its geometry in place", async () => {
    const zone = await seedZone();
    const updated = await upsertZone(
      db,
      { mapId, input: { name: "Vale", x: 0, y: 0, width: 2, height: 2, }, zoneId: zone.id, },
    );

    expect(updated.id,).toBe(zone.id,);
    expect(updated.width,).toBe(2,);
    expect((await listZones(db, { mapId, },)).length,).toBe(1,);
  });

  test("rejects a degenerate zone extent", async () => {
    await expect(
      upsertZone(db, { mapId, input: { name: "Bad", x: 0, y: 0, width: 0, height: 1, }, },),
    ).rejects.toBeInstanceOf(MapError,);
  });

  test("rejects replacing an unknown zone", async () => {
    await expect(
      upsertZone(db, { mapId, input: { name: "Ghost", ...ZONE, }, zoneId: "nope", },),
    ).rejects.toBeInstanceOf(MapError,);
  });
});

describe("anchorZoneToLocation", () => {
  test("the anchor survives re-listing the zones", async () => {
    const locationId = await insertLocations(db, "w1", "Vale Town", { coord_x: 12, coord_y: 21, },);
    const zone = await seedZone();

    const anchored = await anchorZoneToLocation(db, { zoneId: zone.id, locationId, },);
    expect(anchored.locationId,).toBe(locationId,);

    const listed = await listZones(db, { mapId, },);
    expect(listed.length,).toBe(1,);
    expect(listed[0]?.locationId,).toBe(locationId,);
  });

  test("an anchored location's own coordinates resolve back to its zone", async () => {
    const locationId = await insertLocations(db, "w1", "Vale Town", {
      coord_x: 12.5,
      coord_y: 22.25,
      coord_z: 0,
    },);

    const zone = await seedZone();
    await anchorZoneToLocation(db, { zoneId: zone.id, locationId, },);

    const hit = await resolveZoneAtPoint(db, { mapId, x: 12.5, y: 22.25, z: 0, },);
    expect(hit?.id,).toBe(zone.id,);
  });

  test("rejects anchoring an unknown zone", async () => {
    await expect(
      anchorZoneToLocation(db, { zoneId: "nope", locationId: "loc-1", },),
    ).rejects.toBeInstanceOf(MapError,);
  });
});

describe("resolveZoneAtPoint — inclusive boundaries", () => {
  test("x0 (left edge) is inside", async () => {
    await seedZone();
    expect((await resolveZoneAtPoint(db, { mapId, x: EDGES.x0, y: 21, z: 0, },))?.x,).toBe(EDGES.x0,);
  });

  test("x1 (right edge) is inside", async () => {
    await seedZone();
    const hit = await resolveZoneAtPoint(db, { mapId, x: EDGES.x1, y: 21, z: 0, },);
    expect(hit?.x,).toBe(EDGES.x0,);
    expect(hit?.width,).toBe(5,);
  });

  test("y0 (top edge) is inside", async () => {
    await seedZone();
    expect((await resolveZoneAtPoint(db, { mapId, x: 12, y: EDGES.y0, z: 0, },))?.y,).toBe(EDGES.y0,);
  });

  test("y1 (bottom edge) is inside", async () => {
    await seedZone();
    const hit = await resolveZoneAtPoint(db, { mapId, x: 12, y: EDGES.y1, z: 0, },);
    expect(hit?.y,).toBe(EDGES.y0,);
    expect(hit?.height,).toBe(4,);
  });

  test("all four corners hit the same zone", async () => {
    const zone = await seedZone();
    const corners = [
      { x: EDGES.x0, y: EDGES.y0, z: 0, },
      { x: EDGES.x1, y: EDGES.y0, z: 0, },
      { x: EDGES.x0, y: EDGES.y1, z: 0, },
      { x: EDGES.x1, y: EDGES.y1, z: 0, },
    ];

    for (const corner of corners) {
      expect((await resolveZoneAtPoint(db, { mapId, ...corner, },))?.id,).toBe(zone.id,);
    }
  });

  test("one tile outside each edge misses", async () => {
    await seedZone();
    const outside = [
      { x: EDGES.x0 - 1, y: 21, z: 0, },
      { x: EDGES.x1 + 1, y: 21, z: 0, },
      { x: 12, y: EDGES.y0 - 1, z: 0, },
      { x: 12, y: EDGES.y1 + 1, z: 0, },
    ];

    for (const point of outside) {
      expect(await resolveZoneAtPoint(db, { mapId, ...point, },),).toBeNull();
    }
  });

  test("a different layer does not hit the zone", async () => {
    await seedZone();
    expect(await resolveZoneAtPoint(db, { mapId, x: 12, y: 21, z: 1, },),).toBeNull();
  });

  test("a mid-tile fractional point resolves to its zone", async () => {
    await seedZone();
    expect(await resolveZoneAtPoint(db, { mapId, x: 12.75, y: 22.5, z: 0, },),).not.toBeNull();
  });

  test("a 3d map resolves per layer", async () => {
    const tower = await createMap(db, "w1", { name: "Tower", mapType: MapType.ThreeD, width: 20, height: 20, },);
    await upsertZone(db, { mapId: tower.id, input: { name: "Ground", ...ZONE, z: 0, }, },);
    const upper = await upsertZone(db, {
      mapId: tower.id,
      input: { name: "Upper", x: 10, y: 20, width: 5, height: 4, z: 3, },
    },);

    expect((await resolveZoneAtPoint(db, { mapId: tower.id, x: 12, y: 21, z: 0, },))?.name,).toBe("Ground",);
    expect((await resolveZoneAtPoint(db, { mapId: tower.id, x: 12, y: 21, z: 3, },))?.id,).toBe(upper.id,);
    expect(await resolveZoneAtPoint(db, { mapId: tower.id, x: 12, y: 21, z: 1, },),).toBeNull();
  });
});
