// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending-ASI spend contract for the character panel (F2).
 *
 * The panel (src/components/chat/character-info-panel.html `rpg-asi-section`)
 * calls POST /api/rpg/progression/:actorId/asi with { ability, points: 2 }
 * via rpg-stats.ts allocateAsi, and POST .../level-up with { kind: "auto" }
 * via resolveLevelUpAuto. These route tests pin the spend contract those
 * buttons rely on: seed pending_asi=2, spend it, assert 2→0 + stat +2.
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
  const app = new Elysia({ name: "test-rpg-progression-asi", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }

  return app.use(rpgRoutes({ database: db, config: {} as never, },),);
}

describe("pending-ASI panel spend contract", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let actorId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    createLogger({ level: "error", },);
    await insertUsers(db, "asi-owner", "ASI Owner", { id: "user-1" as never, },);
    actorId = await insertActors(db, "ASI Hero", {
      id: "00000000-0000-4000-8000-0000000000a3",
      owner_id: "user-1",
    },);

    await insertCharacterStats(db, actorId, 10, 10, 10, {
      level: 4,
      xp: 2700,
      xp_to_next: 800,
      pending_asi: 2,
      str: 10,
    },);
  },);

  afterAll(() => sqlite.close());

  test("POST /asi {str, 2} spends the full budget and raises str by 2", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/asi`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ ability: "str", points: 2, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.granted,).toBe(2,);
    expect(body.remaining,).toBe(0,);

    const row = await db
      .selectFrom("character_stats",)
      .where("actor_id", "=", actorId,)
      .select(["str", "pending_asi",],)
      .executeTakeFirstOrThrow();

    expect(row.str,).toBe(12,);
    expect(row.pending_asi,).toBe(0,);
  });

  test("POST /asi after the budget is spent returns 400", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/progression/${actorId}/asi`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ ability: "str", points: 2, },),
      },),
    );

    expect(res.status,).toBe(400,);
  });
});
