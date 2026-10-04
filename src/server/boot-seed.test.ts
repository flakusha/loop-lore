// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/boot-seed.test.ts — Boot-time dynamic content seeding
// (boot-seed.ts): chat setup templates first, then the workflow library,
// with the workflow seed requiring a real admin/owner user.

import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { resetSeedOwnerForTests, } from "../generation/workflow-library/seed";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { seedDynamicContent, } from "./boot-seed";

let db: Kysely<DB>;

async function countRows(table: "chat_setup_templates" | "prompt_templates",): Promise<number> {
  const row = await db.selectFrom(table,).select((eb,) => eb.fn.countAll().as("n",)).executeTakeFirst();
  return Number(row?.n ?? 0,);
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  // seedWorkflowLibrary caches the resolved owner id at module scope — reset
  // so each test re-resolves against its own fresh database.
  resetSeedOwnerForTests();
},);

describe("seedDynamicContent", () => {
  test("seeds chat setup templates on a fresh database", async () => {
    await seedDynamicContent(db,);
    expect(await countRows("chat_setup_templates",),).toBeGreaterThan(0,);
  });

  test("skips the workflow seed entirely when no admin/solo user exists", async () => {
    await seedDynamicContent(db,);
    // Chat templates still seed — only the workflow half is owner-gated.
    expect(await countRows("chat_setup_templates",),).toBeGreaterThan(0,);
    expect(await countRows("prompt_templates",),).toBe(0,);
  });

  test("seeds chat templates then workflow templates when an admin exists", async () => {
    await insertUsers(db, "boss", "Boss", { role: "admin", },);
    await seedDynamicContent(db,);
    expect(await countRows("chat_setup_templates",),).toBeGreaterThan(0,);
    // configs/workflows/{img2img,txt2img}.json ship with the repo and are
    // valid ComfyUI graphs, so both import as workflow prompt_templates.
    const workflows = await db
      .selectFrom("prompt_templates",)
      .select(["id", "modality", "owner_id",],)
      .where("modality", "=", "workflow",)
      .execute();

    expect(workflows.length,).toBeGreaterThan(0,);
    for (const w of workflows) {
      expect(w.owner_id,).not.toBeNull();
    }
  });

  test("is idempotent: a second boot seeds nothing new", async () => {
    await insertUsers(db, "boss", "Boss", { role: "admin", },);
    await seedDynamicContent(db,);
    const chatAfterFirst = await countRows("chat_setup_templates",);
    const workflowsAfterFirst = await countRows("prompt_templates",);
    expect(chatAfterFirst,).toBeGreaterThan(0,);
    expect(workflowsAfterFirst,).toBeGreaterThan(0,);

    await seedDynamicContent(db,);
    expect(await countRows("chat_setup_templates",),).toBe(chatAfterFirst,);
    expect(await countRows("prompt_templates",),).toBe(workflowsAfterFirst,);
  });

  test("workflow rows are owned by the oldest qualifying user", async () => {
    const older = await insertUsers(db, "first", "First", { role: "admin", created_at: "2020-01-01T00:00:00Z", },);
    await insertUsers(db, "second", "Second", { role: "admin", created_at: "2021-01-01T00:00:00Z", },);
    await seedDynamicContent(db,);
    const rows = await db
      .selectFrom("prompt_templates",)
      .select("owner_id",)
      .where("modality", "=", "workflow",)
      .execute();

    expect(rows.length,).toBeGreaterThan(0,);
    for (const row of rows) {
      expect(row.owner_id,).toBe(older,);
    }
  });

  test("seeds workflows when the only qualifying user has role solo", async () => {
    const solo = await insertUsers(db, "op", "Operator", { role: "solo", },);
    await seedDynamicContent(db,);
    expect(await countRows("chat_setup_templates",),).toBeGreaterThan(0,);
    const rows = await db
      .selectFrom("prompt_templates",)
      .select("owner_id",)
      .where("modality", "=", "workflow",)
      .execute();

    expect(rows.length,).toBeGreaterThan(0,);
    for (const row of rows) {
      expect(row.owner_id,).toBe(solo,);
    }
  });

  test("skips the workflow seed when no user has a qualifying role", async () => {
    await insertUsers(db, "plain", "Plain", { role: "user", },);
    await seedDynamicContent(db,);
    expect(await countRows("chat_setup_templates",),).toBeGreaterThan(0,);
    expect(await countRows("prompt_templates",),).toBe(0,);
  });
});
