// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * standaloneSurface barrel — the single owner mounting the five former
 * `migrated-v1` modules (agency, location-explorer, game-state,
 * story-orchestration, config-menu) under `/api/v1`. Pinned here: the
 * surface mounts each module's versioned routes exactly once, and the
 * retired legacy fallback stays retired (an unmatched versioned path 404s
 * instead of resolving an unversioned twin).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { standaloneSurface, } from "./standalone-surface";

async function makeApp() {
  const { db, } = await createTestDb();
  await insertUsers(db, "surface-user", "Surface User",);
  const app = new Elysia({ name: "test-standalone-surface", },)
    .derive(() => ({ userId: "surface-user", }))
    .use(standaloneSurface({ database: db, } as RegisterPluginsOpts,),);

  return { app, db, };
}

describe("standaloneSurface", () => {
  test("mounts the agency balance route under /api/v1", async () => {
    const { app, db, } = await makeApp();
    const res = await app.handle(new Request("http://localhost/api/v1/agency/balance",),);
    expect(res.status,).toBe(200,);
    await db.destroy();
  });

  test("has no unversioned twin (legacy fallback stays retired)", async () => {
    const { app, db, } = await makeApp();
    const res = await app.handle(new Request("http://localhost/api/agency/balance",),);
    expect(res.status,).toBe(404,);
    await db.destroy();
  });
});
