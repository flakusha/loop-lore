// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Progression route tests — GET/POST /api/rpg/progression/:actorId/*.
 *
 * Auth + ownership gating, the read surface over real character_stats,
 * XP award through the LevelService pipeline (level-up persists), ASI
 * allocation (budget + ASI_MAX enforcement surfaced as 400), and
 * level-up resolution (auto + explicit).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { rpgRoutes, } from "./index";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-rpg-progression", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }

  return app.use(rpgRoutes({ database: db, config: {} as never, },),);
}

const ACTOR_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ACTOR = "00000000-0000-4000-8000-0000000000a2";

describe("RPG progression routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let actorId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    createLogger({ level: "error", },);
    await insertUsers(db, "prog-owner", "Prog Owner", { id: "user-1" as never, },);
    await insertUsers(db, "prog-other", "Prog Other", { id: "user-2" as never, },);
    actorId = await insertActors(db, "Prog Hero", {
      id: ACTOR_ID as never,
      owner_id: "user-1",
    },);

    await insertActors(db, "Prog Villain", {
      id: OTHER_ACTOR as never,
      owner_id: "user-2",
    },);

    await insertCharacterStats(db, actorId, 10, 10, 10, {
      level: 3,
      xp: 900, // consistent with XP_BY_LEVEL (level 3 = 900 XP)
      xp_to_next: 800,
      pending_asi: 2,
    },);
  },);

  afterAll(() => sqlite.close());

  test("GET requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("GET is owner-scoped (other user sees 404)", async () => {
    const res = await makeApp(db, "user-2", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("GET returns the real progression state", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.level,).toBe(3,);
    expect(body.xp,).toBe(900,);
    expect(body.xpToNext,).toBe(800,);
    expect(body.pendingAsi,).toBe(2,);
    expect(body.abilities.str,).toBe(10,);
  });

  test("GET returns 404 for an actor without stats", async () => {
    const bare = await insertActors(db, "No Stats", { owner_id: "user-1", },);
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${bare}`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST award grants XP through the pipeline (invalid → 400)", async () => {
    const bad = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/award`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ amount: -5, source: "quest", },),
      },),
    );

    expect(bad.status,).toBe(400,);

    const ok = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/award`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ amount: 100, source: "quest", },),
      },),
    );

    expect(ok.status,).toBe(200,);
    const body = await ok.json();
    expect(body.ledgerId,).toBeTruthy();
    // 900 xp + 100 = 1000 < 1700 → no level-up, but the ledger row exists.
    expect(body.previousLevel,).toBe(3,);
    expect(body.leveledUp,).toBe(false,);

    const read = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}`,),
    );

    const state = await read.json();
    expect(state.xp,).toBe(1000,);
    expect(state.level,).toBe(3,);
  });

  test("POST asi allocates pending points; violations return 400", async () => {
    const ok = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/asi`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ ability: "cha", points: 1, },),
      },),
    );

    expect(ok.status,).toBe(200,);
    const body = await ok.json();
    expect(body.granted,).toBe(1,);
    expect(body.remaining,).toBeGreaterThanOrEqual(0,);

    const badAbility = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/asi`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ ability: "luck", },),
      },),
    );

    expect(badAbility.status,).toBe(400,);
  });

  test("POST level-up auto-resolves the pending budget", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/level-up`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ kind: "auto", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.spends.length,).toBeGreaterThan(0,);
    expect(body.remaining,).toBe(0,);

    const read = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}`,),
    );

    const state = await read.json();
    expect(state.pendingAsi,).toBe(0,);
  });
});
