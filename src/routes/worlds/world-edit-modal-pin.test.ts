// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level pin for the world Edit modal's two halves.
 *
 * The unit test drives the Alpine component through a stubbed fetch, so it
 * cannot see either server half the component assumes: the static partial
 * must render the PUT target the component reads its world id from, and the
 * GET world route must serve the name/description/lore shape the component
 * fills the fields with. This file pins both against the real code.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import {
  createTestDb,
  destroyTestDb,
  type TestDb,
} from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { serveStaticPartial, } from "../views/static-partials";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

const BASE = "http://localhost";

function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-world-edit-modal-pin", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("worldRoutes — edit modal pin", () => {
  let fixture: TestDb | undefined;
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    db = fixture.db;

    ownerId = uid();
    await insertUsers(db, "modal-owner", "Modal Owner", { id: ownerId, } as never,);
    worldId = await insertWorlds(db, ownerId, "Pin Realm", {
      description: "pin description",
      lore: "pin lore",
    } as never,);
  },);

  afterEach(async () => {
    if (fixture) {
      await destroyTestDb(fixture,);
      fixture = undefined;
    }
  },);

  test("the static partial renders the PUT target the modal reads its world id from", () => {
    const content = serveStaticPartial("worlds/edit-modal", new URLSearchParams({ worldId, },),);

    expect(content,).not.toBeNull();
    expect(content,).toContain(`hx-put="/api/v1/worlds/${worldId}"`,);
    expect(content,).toContain('id="edit-world-save"',);
    expect(content,).toMatch(/id="edit-world-save"[^>]*disabled/,);
    expect(content,).toContain('x-data="worldEditModal()"',);
  });

  test("GET /api/worlds/:id serves the name/description/lore shape the modal fills", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(new Request(`${BASE}/api/worlds/${worldId}`,),);

    expect(res.status,).toBe(200,);
    const row = (await res.json()) as { name: unknown; description: unknown; lore: unknown };
    expect(row.name,).toBe("Pin Realm",);
    expect(row.description,).toBe("pin description",);
    expect(row.lore,).toBe("pin lore",);
  });
});
