// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owner resolution for the workflow seed.
 *
 * A default install runs in **solo mode**: the operator's account has
 * `role = 'solo'` and no `admin` user exists until the avatar seeder runs later
 * in boot. An earlier version matched `role = 'admin'` only, so the seed skipped
 * on every fresh install while its unit tests still passed — they created an
 * admin. These tests pin the real deployment shapes.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { resetSeedOwnerForTests, seedWorkflowLibrary, } from "./seed";

const SHIPPED_DIR = "./configs/workflows";

let db: Kysely<DB>;
let sqlite: Database;

beforeEach(async () => {
  const made = await createTestDb();
  db = made.db;
  sqlite = made.sqlite;
  resetSeedOwnerForTests();
},);

afterEach(async () => {
  await db.destroy();
  sqlite.close();
  resetSeedOwnerForTests();
},);

/** True when every seeded workflow row belongs to `expected`. */
async function allSeededRowsOwnedBy(expected: string,): Promise<boolean> {
  const rows = await db
    .selectFrom("prompt_templates",)
    .select("owner_id",)
    .where("modality", "=", "workflow",)
    .execute();

  return rows.length > 0 && rows.every((r,) => r.owner_id === expected);
}

describe("workflow seed owner resolution", () => {
  it("seeds under the solo user when there is no admin", async () => {
    await insertUsers(db, "demo", "Demo", { id: "solo-1", role: "solo", },);

    const outcome = await seedWorkflowLibrary(db, SHIPPED_DIR,);

    expect(outcome.imported.length,).toBeGreaterThan(0,);
    expect(await allSeededRowsOwnedBy("solo-1",),).toBe(true,);
  });

  it("seeds under the admin in multi-user mode", async () => {
    await insertUsers(db, "admin", "Admin", { id: "admin-1", role: "admin", },);

    const outcome = await seedWorkflowLibrary(db, SHIPPED_DIR,);

    expect(outcome.imported.length,).toBeGreaterThan(0,);
    expect(await allSeededRowsOwnedBy("admin-1",),).toBe(true,);
  });

  it("prefers the oldest qualifying user when both exist", async () => {
    await insertUsers(db, "admin", "Admin", {
      id: "admin-1",
      role: "admin",
      created_at: "2026-01-01 00:00:00",
    },);

    await insertUsers(db, "demo", "Demo", {
      id: "solo-1",
      role: "solo",
      created_at: "2026-06-01 00:00:00",
    },);

    await seedWorkflowLibrary(db, SHIPPED_DIR,);

    expect(await allSeededRowsOwnedBy("admin-1",),).toBe(true,);
  });

  it("skips rather than inventing a user when nobody qualifies", async () => {
    const outcome = await seedWorkflowLibrary(db, SHIPPED_DIR,);
    expect(outcome.imported,).toEqual([],);
    expect(outcome.skipped,).toEqual([],);
  });
});
