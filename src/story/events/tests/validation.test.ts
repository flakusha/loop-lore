/**
 * Event Validation Tests
 */

import { beforeEach, describe, expect, it, } from "bun:test";
import { WorldEventType, } from "../../../db/enums";
import { createTestDb, } from "../../../test-utils/create-test-db";
import type { WorldEvent, } from "../../types";
import { validateEvents, } from "../validation";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;

  // Insert a user for foreign key constraints
  await db.insertInto("users",).values({
    id: "user-1",
    username: "testuser",
    display_name: "Test User",
    password_hash: "hash",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();

  // Insert a world for foreign key constraints
  await db.insertInto("worlds",).values({
    id: "world-1",
    name: "Test World",
    description: "A test world",
    owner_id: "user-1",
    difficulty_modifier: 1,
    difficulty_reroll: "none",
    difficulty_state: "normal",
  },).execute();
},);

describe("validateEvents", () => {
  it("passes through events that don't reference locations", async () => {
    const events: WorldEvent[] = [
      {
        type: WorldEventType.CombatEvent,
        timestamp: new Date().toISOString(),
        description: "NPC combat",
        data: { attacker: "npc-1", defender: "npc-2", },
      },
      {
        type: WorldEventType.TimeAdvancement,
        timestamp: new Date().toISOString(),
        description: "Time advances",
        data: { hours: 2, },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(true,);
    expect(result.filteredEvents.length,).toBe(2,);
    expect(result.rejections.length,).toBe(0,);
  });

  it("rejects LocationChange events with unknown location name", async () => {
    const events: WorldEvent[] = [
      {
        type: WorldEventType.LocationChange,
        timestamp: new Date().toISOString(),
        description: "Move to unknown",
        data: { toLocationName: "Unknown Forest", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(false,);
    expect(result.filteredEvents.length,).toBe(0,);
    expect(result.rejections.length,).toBe(1,);
    expect(result.rejections[0],).toContain("Unknown location",);
  });

  it("accepts LocationChange events with valid location name", async () => {
    // Insert a location
    await db.insertInto("locations",).values({
      id: "loc-1",
      name: "Town Square",
      world_id: "world-1",
      connections: "[]",
    },).execute();

    const events: WorldEvent[] = [
      {
        type: WorldEventType.LocationChange,
        timestamp: new Date().toISOString(),
        description: "Move to Town Square",
        data: { toLocationName: "Town Square", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(true,);
    expect(result.filteredEvents.length,).toBe(1,);
    expect(result.filteredEvents[0]!.locationId,).toBe("loc-1",);
  });

  it("accepts LocationModification events with valid location ID", async () => {
    await db.insertInto("locations",).values({
      id: "loc-1",
      name: "Town Square",
      world_id: "world-1",
      connections: "[]",
    },).execute();

    const events: WorldEvent[] = [
      {
        type: WorldEventType.LocationModification,
        timestamp: new Date().toISOString(),
        description: "Modify location",
        data: { locationId: "loc-1", modification: "flooded", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(true,);
    expect(result.filteredEvents.length,).toBe(1,);
  });

  it("rejects LocationModification events with unknown location ID", async () => {
    const events: WorldEvent[] = [
      {
        type: WorldEventType.LocationModification,
        timestamp: new Date().toISOString(),
        description: "Modify unknown location",
        data: { locationId: "nonexistent", modification: "flooded", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(false,);
    expect(result.rejections[0],).toContain("Invalid location modification target",);
  });

  it("case-insensitive location name matching", async () => {
    await db.insertInto("locations",).values({
      id: "loc-1",
      name: "Dark Cave",
      world_id: "world-1",
      connections: "[]",
    },).execute();

    const events: WorldEvent[] = [
      {
        type: WorldEventType.LocationChange,
        timestamp: new Date().toISOString(),
        description: "Move to dark cave",
        data: { toLocationName: "dark cave", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(true,);
    expect(result.filteredEvents[0]!.locationId,).toBe("loc-1",);
  });

  it("handles mixed valid and invalid events", async () => {
    await db.insertInto("locations",).values({
      id: "loc-1",
      name: "Forest",
      world_id: "world-1",
      connections: "[]",
    },).execute();

    const events: WorldEvent[] = [
      {
        type: WorldEventType.CombatEvent,
        timestamp: new Date().toISOString(),
        description: "NPC combat",
        data: { attacker: "npc-1", },
      },
      {
        type: WorldEventType.LocationChange,
        timestamp: new Date().toISOString(),
        description: "Move to unknown",
        data: { toLocationName: "Unknown Place", },
      },
      {
        type: WorldEventType.LocationChange,
        timestamp: new Date().toISOString(),
        description: "Move to Forest",
        data: { toLocationName: "Forest", },
      },
    ];

    const result = await validateEvents({
      db,
      worldId: "world-1",
      events,
    },);

    expect(result.valid,).toBe(false,);
    expect(result.filteredEvents.length,).toBe(2,);
    expect(result.rejections.length,).toBe(1,);
  });

  it("returns empty result for no events", async () => {
    const result = await validateEvents({
      db,
      worldId: "world-1",
      events: [],
    },);

    expect(result.valid,).toBe(true,);
    expect(result.filteredEvents.length,).toBe(0,);
    expect(result.rejections.length,).toBe(0,);
  });
});
