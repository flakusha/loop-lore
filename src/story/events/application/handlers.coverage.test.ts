// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event-application handler coverage — every applySingleEvent dispatch arm
 * plus edge cases (missing ids, empty changes) and damaged data (corrupt
 * JSON, FK-violating ids, unknown event types).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldEventType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { ItemsService, } from "../../items";
import type { WorldEvent, } from "../../types";
import {
  applyCombatEvent,
  applyLocationChange,
  applyLocationModification,
  applyNpcStateChange,
  applySingleEvent,
  applyTimeAdvancement,
  applyWorldLoreUpdate,
} from "./handlers";

let db: Kysely<DB>;
let items: ItemsService;
let worldId: string;
let userId: string;
let actorId: string;
let locA: string;
let locB: string;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  ({ db, } = await createTestDb());
  items = new ItemsService(db,);
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Handler World", { id: worldId, lore: "Old lore", } as never,);
  actorId = uid();
  await insertActors(db, "Guard", { id: actorId, } as never,);
  locA = uid();
  locB = uid();
  await insertLocations(db, worldId, "Gate", { id: locA, } as never,);
  await insertLocations(db, worldId, "Keep", { id: locB, } as never,);
  await insertNpcStates(db, actorId, worldId, {
    location_id: locA,
    health: 80,
    mental_state: "neutral",
  } as never,);
  await insertLocationStates(db, locA, worldId, { time_of_day: "morning", },);
},);

afterEach(async () => {
  await db.destroy();
},);

/**
 * @param type
 * @param data
 * @param extra
 */
function event(
  type: WorldEvent["type"],
  data: Record<string, unknown> = {},
  extra: Partial<WorldEvent> = {},
): WorldEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data,
    description: "test event",
    ...extra,
  };
}

/** */
async function npcHealth(): Promise<{ health: number; mental_state: string; location_id: string | null }> {
  const row = await db
    .selectFrom("npc_states",)
    .select(["health", "mental_state", "location_id",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirstOrThrow();
  return {
    health: row.health,
    mental_state: row.mental_state ?? "",
    location_id: row.location_id,
  };
}

describe("applyLocationChange", () => {
  test("moves the actor to the new location", async () => {
    await applyLocationChange(db, event(WorldEventType.LocationChange, {}, { actorId, locationId: locB, },),);
    expect((await npcHealth()).location_id,).toBe(locB,);
  });

  test("no locationId is a no-op", async () => {
    await applyLocationChange(db, event(WorldEventType.LocationChange, {}, { actorId, },),);
    expect((await npcHealth()).location_id,).toBe(locA,);
  });

  test("no actorId is a no-op", async () => {
    await applyLocationChange(db, event(WorldEventType.LocationChange, {}, { locationId: locB, },),);
    expect((await npcHealth()).location_id,).toBe(locA,);
  });

  test("unknown actor id touches nothing and does not throw", async () => {
    await applyLocationChange(
      db,
      event(WorldEventType.LocationChange, {}, { actorId: uid(), locationId: locB, },),
    );
    expect((await npcHealth()).location_id,).toBe(locA,);
  });
});

describe("applyNpcStateChange", () => {
  test("applies health and mental-state changes", async () => {
    await applyNpcStateChange(
      db,
      event(WorldEventType.NpcStateChange, {
        npcActorId: actorId,
        changes: { health: 30, mental_state: "hostile", },
      },),
    );
    const npc = await npcHealth();
    expect(npc.health,).toBe(30,);
    expect(npc.mental_state,).toBe("hostile",);
  });

  test("falls back to event.actorId when npcActorId is absent", async () => {
    await applyNpcStateChange(
      db,
      event(WorldEventType.NpcStateChange, { changes: { health: 10, }, }, { actorId, },),
    );
    expect((await npcHealth()).health,).toBe(10,);
  });

  test("serializes relationship and knowledge maps", async () => {
    await applyNpcStateChange(
      db,
      event(WorldEventType.NpcStateChange, {
        npcActorId: actorId,
        changes: { relationships: { friend: 5, }, knowledge: { rumor: "x", }, },
      },),
    );
    const row = await db
      .selectFrom("npc_states",)
      .select(["relationships", "knowledge",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(String(row.relationships ?? "{}",),),).toEqual({ friend: 5, },);
    expect(JSON.parse(String(row.knowledge ?? "{}",),),).toEqual({ rumor: "x", },);
  });

  test("corrupt (circular) maps are skipped without failing the update", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    await applyNpcStateChange(
      db,
      event(WorldEventType.NpcStateChange, {
        npcActorId: actorId,
        changes: { health: 55, relationships: circular, },
      },),
    );
    // Scalar change still applied; corrupt map skipped.
    expect((await npcHealth()).health,).toBe(55,);
  });

  test("no actor anywhere is a no-op", async () => {
    await applyNpcStateChange(db, event(WorldEventType.NpcStateChange, { changes: { health: 1, }, },),);
    expect((await npcHealth()).health,).toBe(80,);
  });

  test("damaged data — missing changes object rejects", async () => {
    await expect(
      applyNpcStateChange(db, event(WorldEventType.NpcStateChange, {}, { actorId, },),),
    ).rejects.toThrow();
  });
});

describe("applyTimeAdvancement", () => {
  test("short advances stay in the same period", async () => {
    await applyTimeAdvancement(db, worldId, event(WorldEventType.TimeAdvancement, { minutesAdvanced: 60, },),);
    const row = await db
      .selectFrom("location_states",)
      .select("time_of_day",)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.time_of_day,).toBe("morning",);
  });

  test("200 minutes advance one step and wrap around midnight", async () => {
    await applyTimeAdvancement(db, worldId, event(WorldEventType.TimeAdvancement, { minutesAdvanced: 200, },),);
    const row = await db
      .selectFrom("location_states",)
      .select("time_of_day",)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.time_of_day,).toBe("afternoon",);
  });

  test("defaults to 60 minutes when the payload omits the field", async () => {
    await applyTimeAdvancement(db, worldId, event(WorldEventType.TimeAdvancement, {},),);
    const row = await db
      .selectFrom("location_states",)
      .select("time_of_day",)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.time_of_day,).toBe("morning",);
  });

  test("corrupt time_of_day resets to morning instead of crashing", async () => {
    await insertLocationStates(db, locB, worldId, { time_of_day: "o'clock", },);
    await applyTimeAdvancement(db, worldId, event(WorldEventType.TimeAdvancement, { minutesAdvanced: 200, },),);
    const row = await db
      .selectFrom("location_states",)
      .select("time_of_day",)
      .where("location_id", "=", locB,)
      .executeTakeFirstOrThrow();
    expect(row.time_of_day,).toBe("morning",);
  });

  test("FK-violating world id touches nothing", async () => {
    await applyTimeAdvancement(db, uid(), event(WorldEventType.TimeAdvancement, { minutesAdvanced: 500, },),);
    const row = await db
      .selectFrom("location_states",)
      .select("time_of_day",)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.time_of_day,).toBe("morning",);
  });
});

describe("applyLocationModification", () => {
  test("applies description, atmosphere, weather, and hazards", async () => {
    await applyLocationModification(
      db,
      event(WorldEventType.LocationModification, {
        locationId: locA,
        changes: {
          description_override: "Burned gate",
          atmosphere: "tense",
          weather: "rain",
          hazards: ["fire",],
        },
      },),
    );
    const row = await db
      .selectFrom("location_states",)
      .select(["description_override", "atmosphere", "weather", "hazards",],)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.description_override,).toBe("Burned gate",);
    expect(row.atmosphere,).toBe("tense",);
    expect(row.weather,).toBe("rain",);
    expect(JSON.parse(String(row.hazards ?? "[]",),),).toEqual(["fire",],);
  });

  test("falls back to event.locationId", async () => {
    await applyLocationModification(
      db,
      event(WorldEventType.LocationModification, { changes: { atmosphere: "calm", }, }, { locationId: locA, },),
    );
    const row = await db
      .selectFrom("location_states",)
      .select("atmosphere",)
      .where("location_id", "=", locA,)
      .executeTakeFirstOrThrow();
    expect(row.atmosphere,).toBe("calm",);
  });

  test("missing location is a no-op", async () => {
    await applyLocationModification(db, event(WorldEventType.LocationModification, { changes: {}, },),);
  });
});

describe("applyWorldLoreUpdate", () => {
  test("appends the entry to the world lore blob", async () => {
    await applyWorldLoreUpdate(
      db,
      worldId,
      event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "A dragon passed overhead.", },),
    );
    const world = await db.selectFrom("worlds",).select("lore",).where("id", "=", worldId,).executeTakeFirstOrThrow();
    expect(world.lore,).toContain("Old lore",);
    expect(world.lore,).toContain("A dragon passed overhead.",);
  });

  test("promotion creates a structured lore row by default", async () => {
    await applyWorldLoreUpdate(
      db,
      worldId,
      event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "Promoted fact.", },),
    );
    const rows = await db
      .selectFrom("world_lore_entries",)
      .select("content",)
      .where("world_id", "=", worldId,)
      .execute();
    expect(rows.map((r,) => r.content),).toContain("Promoted fact.",);
  });

  test("promoteToLore false skips the structured row", async () => {
    await applyWorldLoreUpdate(
      db,
      worldId,
      event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "Unpromoted.", promoteToLore: false, },),
    );
    const rows = await db
      .selectFrom("world_lore_entries",)
      .select("content",)
      .where("world_id", "=", worldId,)
      .execute();
    expect(rows,).toEqual([],);
  });

  test("empty entry is a no-op", async () => {
    await applyWorldLoreUpdate(db, worldId, event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "", },),);
    const world = await db.selectFrom("worlds",).select("lore",).where("id", "=", worldId,).executeTakeFirstOrThrow();
    expect(world.lore,).toBe("Old lore",);
  });

  test("FK-violating world id resolves without writing", async () => {
    await applyWorldLoreUpdate(
      db,
      uid(),
      event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "Lost lore.", },),
    );
  });
});

describe("applyCombatEvent", () => {
  test("damage reduces health and turns the NPC hostile", async () => {
    await applyCombatEvent(
      db,
      event(WorldEventType.CombatEvent, { defenderId: actorId, damage: 30, },),
    );
    const npc = await npcHealth();
    expect(npc.health,).toBe(50,);
    expect(npc.mental_state,).toBe("hostile",);
  });

  test("defeat zeroes health and marks defeated", async () => {
    await applyCombatEvent(
      db,
      event(WorldEventType.CombatEvent, { defenderId: actorId, damage: 5, defeated: true, },),
    );
    const npc = await npcHealth();
    expect(npc.health,).toBe(0,);
    expect(npc.mental_state,).toBe("defeated",);
  });

  test("overkill floors at zero and marks defeated", async () => {
    await applyCombatEvent(
      db,
      event(WorldEventType.CombatEvent, { defenderId: actorId, damage: 9999, },),
    );
    const npc = await npcHealth();
    expect(npc.health,).toBe(0,);
    expect(npc.mental_state,).toBe("defeated",);
  });

  test("falls back to actorId and default damage", async () => {
    await applyCombatEvent(db, event(WorldEventType.CombatEvent, {}, { actorId, },),);
    expect((await npcHealth()).health,).toBe(70,);
  });

  test("unknown defender resolves without writing", async () => {
    await applyCombatEvent(db, event(WorldEventType.CombatEvent, { defenderId: uid(), damage: 10, },),);
    expect((await npcHealth()).health,).toBe(80,);
  });

  test("no defender at all is a no-op", async () => {
    await applyCombatEvent(db, event(WorldEventType.CombatEvent, {},),);
    expect((await npcHealth()).health,).toBe(80,);
  });
});

describe("applySingleEvent dispatch", () => {
  test("routes each type and reports applied", async () => {
    const cases: WorldEvent[] = [
      event(WorldEventType.LocationChange, {}, { actorId, locationId: locB, },),
      event(WorldEventType.NpcStateChange, { npcActorId: actorId, changes: { health: 77, }, },),
      event(WorldEventType.TimeAdvancement, { minutesAdvanced: 60, },),
      event(WorldEventType.LocationModification, { locationId: locA, changes: { atmosphere: "x", }, },),
      event(WorldEventType.WorldLoreUpdate, { newLoreEntry: "y", promoteToLore: false, },),
      event(WorldEventType.CombatEvent, { defenderId: actorId, damage: 1, },),
      event(WorldEventType.QuestProgress, { progress: 1, },),
    ];
    for (const e of cases) {
      const res = await applySingleEvent(db, worldId, items, e,);
      expect(res.applied,).toBe(true,);
      expect(res.event,).toBe(e,);
    }
    expect((await npcHealth()).location_id,).toBe(locB,);
  });

  test("damaged input — unknown event type throws", async () => {
    await expect(
      applySingleEvent(db, worldId, items, event("bogus_type" as never,),),
    ).rejects.toThrow();
  });
});
