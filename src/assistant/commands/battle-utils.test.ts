// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * loadBattleEnvironment — world conditions as panel effect labels.
 * Real test DB: success reads the world's conditions snapshot, a missing
 * world degrades to empty labels (best-effort contract).
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers.js";
import { loadBattleEnvironment, } from "./battle-utils";

describe("loadBattleEnvironment", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("returns no labels without a world", async () => {
    expect(await loadBattleEnvironment(db, null,),).toEqual([],);
  });

  it("labels weather and season from the world snapshot", async () => {
    const userId = `user-${Date.now()}`;
    await insertUsers(
      db,
      userId,
      "Env Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    const worldId = await insertWorlds(db, userId, "Battle Env World",);

    const labels = await loadBattleEnvironment(db, worldId,);
    expect(labels,).toHaveLength(2,);
    expect(labels[0]?.name,).toMatch(/^Weather: /,);
    expect(labels[1]?.name,).toMatch(/^Season: /,);
  });

  it("degrades to no labels when the world is unreadable", async () => {
    expect(await loadBattleEnvironment(db, "world-missing",),).toEqual([],);
  });
});
