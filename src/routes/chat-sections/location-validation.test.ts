// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for validateSectionLocation — the gate route handlers share.
 *
 * Each outcome is asserted directly (success row, world-less 400,
 * foreign-world 404, unknown-location 404) so the export is covered by name,
 * not only transitively through the create/update routes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertUsers, } from "../../test-utils/insert-helpers";
import { validateSectionLocation, } from "./location-validation";

describe("validateSectionLocation", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const worldId = crypto.randomUUID();
  const foreignWorldId = crypto.randomUUID();
  const locationId = crypto.randomUUID();
  const foreignLocationId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Section Validation User", { id: userId, } as never,);
    await db.insertInto("worlds",).values({ id: worldId, name: "Section World", owner_id: userId, },)
      .execute();

    await db.insertInto("worlds",).values({ id: foreignWorldId, name: "Foreign World", owner_id: userId, },)
      .execute();

    await insertLocations(db, worldId, "Tavern", { id: locationId, } as never,);
    await insertLocations(db, foreignWorldId, "Foreign Tavern", { id: foreignLocationId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("resolves a location in the chat's world", async () => {
    const result = await validateSectionLocation(db, { world_id: worldId, }, locationId,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.location.id,).toBe(locationId,);
    }
  });

  test("rejects with 400 when the chat has no world", async () => {
    const result = await validateSectionLocation(db, { world_id: null, }, locationId,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.response.status,).toBe(400,);
    }
  });

  test("rejects a foreign-world location with 404", async () => {
    const result = await validateSectionLocation(db, { world_id: worldId, }, foreignLocationId,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.response.status,).toBe(404,);
    }
  });

  test("rejects an unknown location with 404", async () => {
    const result = await validateSectionLocation(db, { world_id: worldId, }, crypto.randomUUID(),);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.response.status,).toBe(404,);
    }
  });
});
