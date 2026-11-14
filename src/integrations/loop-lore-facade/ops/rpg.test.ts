// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/rpg.test.ts — the rpg facade ops over
// a :memory: database.
//
// Covers the slice's acceptance surfaces end-to-end through runFacadeOp:
//  - a permitted principal kind succeeds and returns the expected shape;
//  - another user's character state is unreachable (the cross-actor proof);
//  - the ops are read-only — nothing is rolled, spent or advanced;
//  - a principal kind the domain does not admit is refused with the
//    facade's own 403 `forbidden` shape.
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, no ports, no env, no sleeps.

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import { ItemCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { principalKind, type PrincipalKindLiteral, } from "../../../middleware/principal-kind";
import { createRequestContext, } from "../../../middleware/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActorLocations,
  insertActors,
  insertCharacterStats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { createFacadeRegistry, type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";
import { facadeContextFromRequestContext, } from "../types";
import {
  registerRpgOps,
  RpgActorBody,
  RpgInventoryOutputSchema,
  RpgLocationOutputSchema,
  RpgStatsOutputSchema,
} from "./rpg";

const USER = "facade-rpg-user";
const OTHER = "facade-rpg-other";
const OWN_ACTOR = "facade-rpg-own";
const FOREIGN_ACTOR = "facade-rpg-foreign";

let testDb: TestDb;
let db: Kysely<DB>;
const config = {} as Config;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, USER, "Facade Rpg User", { id: USER, },);
  await insertUsers(db, OTHER, "Facade Rpg Other", { id: OTHER, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

function buildRegistry(): FacadeRegistry {
  const registry = createFacadeRegistry();
  registerRpgOps(registry, { database: db, config, },);
  return registry;
}

function ctxFor(userId: string, kind: PrincipalKindLiteral = "user",): FacadeContext {
  const rc = createRequestContext({
    userId,
    userRole: "user",
    sessionId: null,
    principalKind: principalKind(kind,),
    credentialId: kind === "external-agent" ? "facade-rpg-cred" : null,
    credentialName: kind === "external-agent" ? "facade-rpg-token" : null,
    credentialScope: kind === "external-agent" ? "read" : null,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-rpg", }, db, config,);
}

async function seedRpg(): Promise<void> {
  const worldId = await insertWorlds(db, USER, "Facade Rpg World", { id: "facade-rpg-world", },);
  const physicalId = await insertLocations(db, worldId, "The Common Room", { id: "facade-rpg-place", },);
  const spatialId = await insertLocations(db, worldId, "The Village Square", { id: "facade-rpg-square", },);

  await insertActors(db, "Alice", { id: OWN_ACTOR, owner_id: USER, user_id: USER, },);
  await insertCharacterStats(db, OWN_ACTOR, 20, 30, 15, {
    level: 3,
    str: 12,
    dex: 14,
    con: 13,
    int: 10,
    wis: 11,
    cha: 9,
    xp: 300,
    xp_to_next: 900,
    character_state: "active",
    behavior_profile: "BEHAVIOR-PROFILE-TEXT",
  },);

  await insertActorItems(db, OWN_ACTOR, "Notched sword", ItemCategory.Weapon, { quantity: 1, },);
  await insertActorLocations(db, physicalId, spatialId, { actor_id: OWN_ACTOR, },);

  await insertActors(db, "Mallory", { id: FOREIGN_ACTOR, owner_id: OTHER, user_id: OTHER, },);
  await insertCharacterStats(db, FOREIGN_ACTOR, 5, 5, 5, { level: 9, },);
}

describe("facade rpg ops", () => {
  test("rpg.stats returns the caller's character state", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "rpg.stats",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as Record<string, unknown>;
    expect(json.level,).toBe(3,);
    expect(json.hp,).toBe(20,);
    expect(json.maxHp,).toBe(30,);
    expect(json.ac,).toBe(15,);
    expect(json.characterState,).toBe("active",);
    expect(json.abilities,).toEqual({ str: 12, dex: 14, con: 13, int: 10, wis: 11, cha: 9, },);

    // The behavior profile is the character's inner state — not surfaced.
    expect(json.behaviorProfile,).toBeUndefined();
    expect(JSON.stringify(result.json,),).not.toContain("BEHAVIOR-PROFILE-TEXT",);
  });

  test("rpg.inventory returns the caller's items", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "rpg.inventory",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as { data: { name: string; itemType: string; quantity: number }[]; total: number };
    expect(json.total,).toBe(1,);
    expect(json.data[0]?.name,).toBe("Notched sword",);
    expect(json.data[0]?.itemType,).toBe("weapon",);
    expect(json.data[0]?.quantity,).toBe(1,);
  });

  test("rpg.location returns the caller's physical and spatial location", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "rpg.location",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as { physical: { name: string }; spatial: { name: string } };
    expect(json.physical.name,).toBe("The Common Room",);
    expect(json.spatial.name,).toBe("The Village Square",);
  });

  test("a malformed body is refused with the facade's own 400 shape", async () => {
    const registry = buildRegistry();

    const stats = await runFacadeOp(registry, ctxFor(USER,), "rpg.stats", {},);
    expect(stats.ok,).toBe(false,);
    expect(stats.status,).toBe(400,);
    expect((stats.json as { error: string }).error,).toBe("bad_request",);

    const inventory = await runFacadeOp(registry, ctxFor(USER,), "rpg.inventory", {},);
    expect(inventory.ok,).toBe(false,);
    expect(inventory.status,).toBe(400,);
    expect((inventory.json as { error: string }).error,).toBe("bad_request",);
  });

  test("rpg.stats hides another user's character behind a 404", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "rpg.stats",
      { actorId: FOREIGN_ACTOR, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
    expect(JSON.stringify(result.json,),).not.toContain("level",);
  });

  test("the rpg domain refuses a principal kind it does not admit", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "user-worktree",),
      "rpg.stats",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error: string }).error,).toBe("forbidden",);
  });

  test("the rpg domain admits the external-agent principal kind with a read tier", async () => {
    await seedRpg();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "external-agent",),
      "rpg.stats",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
  });

  test("the rpg ops are read-only — a read never changes the stored state", async () => {
    await seedRpg();

    await runFacadeOp(buildRegistry(), ctxFor(USER,), "rpg.stats", { actorId: OWN_ACTOR, },);
    await runFacadeOp(buildRegistry(), ctxFor(USER,), "rpg.inventory", { actorId: OWN_ACTOR, },);

    const row = await db
      .selectFrom("character_stats",)
      .select(["hp", "level", "xp",],)
      .where("actor_id", "=", OWN_ACTOR,)
      .executeTakeFirst();

    expect(row?.hp,).toBe(20,);
    expect(row?.level,).toBe(3,);
    expect(row?.xp,).toBe(300,);

    const items = await db.selectFrom("actor_items",).selectAll().execute();
    expect(items.length,).toBe(1,);
  });

  test("every rpg call writes one audit row through the shared audit path", async () => {
    await seedRpg();

    await runFacadeOp(buildRegistry(), ctxFor(USER,), "rpg.stats", { actorId: OWN_ACTOR, },);

    const rows = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "facade.op",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]?.action,).toBe("rpg.stats",);
    expect(rows[0]?.user_id,).toBe(USER,);
  });

  test("rpg.stats declares honest annotations - read-only, never idempotent", () => {
    const annotations = buildRegistry().resolve("rpg.stats",)?.annotations;
    expect(annotations?.readOnlyHint,).toBe(true,);
    expect(annotations?.idempotentHint,).toBeUndefined();
  });

  test("rpg.inventory declares honest annotations - read-only, never idempotent", () => {
    const annotations = buildRegistry().resolve("rpg.inventory",)?.annotations;
    expect(annotations?.readOnlyHint,).toBe(true,);
    expect(annotations?.idempotentHint,).toBeUndefined();
  });

  test("rpg.location declares honest annotations - read-only, never idempotent", () => {
    const annotations = buildRegistry().resolve("rpg.location",)?.annotations;
    expect(annotations?.readOnlyHint,).toBe(true,);
    expect(annotations?.idempotentHint,).toBeUndefined();
  });

  test("the rpg ops carry the schemas a manifest generator needs", () => {
    const registry = buildRegistry();

    expect(registry.resolve("rpg.stats",)?.bodySchema,).toBe(RpgActorBody,);
    expect(registry.resolve("rpg.stats",)?.outputSchema,).toBe(RpgStatsOutputSchema,);
    expect(registry.resolve("rpg.inventory",)?.outputSchema,).toBe(RpgInventoryOutputSchema,);
    expect(registry.resolve("rpg.location",)?.outputSchema,).toBe(RpgLocationOutputSchema,);
  });
});
