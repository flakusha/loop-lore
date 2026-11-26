// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the actor E2E public-key read endpoint.
 * Covers the auth gate (401 without a caller) and the missing-key
 * 404 over a real test DB with no keys seeded.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { actorE2EPubkeyRoutes, } from "./actor-e2e-pubkeys";

describe("actorE2EPubkeyRoutes — GET e2e-public-key", () => {
  test("unauthenticated → 401", async () => {
    const app = new Elysia({ name: "test-e2e-pubkeys-unauth", },)
      .use(actorE2EPubkeyRoutes({ database: {} as never, },),) as unknown as Elysia;

    const res = await app.handle(
      new Request("http://localhost/api/actors/actor-1/e2e-public-key",),
    );

    expect(res.status,).toBe(401,);
  });

  describe("over a real DB with no keys", () => {
    let db: Kysely<DB>;

    beforeAll(async () => {
      createLogger({ level: "error", },);
      ({ db, } = await createTestDb());
    },);

    afterAll(async () => {
      await db.destroy();
    },);

    test("no active key → 404", async () => {
      const userId = uid();
      const app = new Elysia({ name: "test-e2e-pubkeys-404", },)
        .derive(() => ({ userId, }))
        .use(actorE2EPubkeyRoutes({ database: db, },),) as unknown as Elysia;

      const res = await app.handle(
        new Request(`http://localhost/api/actors/${userId}/e2e-public-key`,),
      );

      expect(res.status,).toBe(404,);
    });
  });
});
