// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for story-item handlers (definitions / instances / transfer).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../../chat/service";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorldItems, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { worldsRoutes, } from "../worlds";
import {
  checkWorldOwnership,
  enumOr,
  handleDefinition,
  handleDefinitions,
  handleDeleteDefinition,
  handleInstance,
  handleInstances,
  handleTransfer,
} from "./handlers";

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("story-items handlers coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedChatSetupTemplates(db,);
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    const worldsApp = new Elysia({ name: "test-story-items-world", },)
      .derive({ as: "scoped", }, () => ({ userId: owner, userRole: "user", }),)
      .use(worldsRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
    const res = await worldsApp.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Item World", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();
    worldId = created.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("enumOr passes valid values and falls back otherwise", () => {
    expect(enumOr("weapon", Object.values(ItemCategory,), "other",),).toBe("weapon",);
    expect(enumOr("nope", Object.values(ItemCategory,), "other",),).toBe("other",);
    expect(enumOr(42, Object.values(ItemCategory,), "other",),).toBe("other",);
    expect(enumOr(undefined, Object.values(ItemCategory,), "other",),).toBe("other",);
  },);

  test("checkWorldOwnership gates on owner, admin, and existence", async () => {
    expect(await checkWorldOwnership(db, worldId, owner, "user",),).toBe(true,);
    expect(await checkWorldOwnership(db, worldId, stranger, "user",),).toBe(false,);
    expect(await checkWorldOwnership(db, worldId, stranger, "admin",),).toBe(true,);
    expect(await checkWorldOwnership(db, uid(), owner, "user",),).toBe(false,);
  },);

  test("definitions POST requires a name", async () => {
    const res = await handleDefinitions(db, "POST", worldId, owner, "user", 1, 20, undefined, {},);
    expect(res.status,).toBe(400,);
  },);

  test("definitions POST creates and GET lists with pagination", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Sword", category: "weapon", rarity: "rare", },
    );
    expect(created.status,).toBe(201,);
    const createdBody: { id: string } = await created.json();
    expect(createdBody.id.length,).toBeGreaterThan(0,);

    const bogusCategory = await handleDefinitions(db, "GET", worldId, owner, "user", 1, 20, "nope",);
    expect(bogusCategory.status,).toBe(200,);

    const listed = await handleDefinitions(db, "GET", worldId, owner, "user", 1, 20, "weapon",);
    expect(listed.status,).toBe(200,);
    const page: { data: { id: string }[]; pagination: { total: number } } = await listed.json();
    expect(page.data.some((d,) => d.id === createdBody.id,),).toBe(true,);
  },);

  test("definitions reject strangers and missing worlds", async () => {
    const deniedGet = await handleDefinitions(db, "GET", worldId, stranger, "user", 1, 20,);
    expect(deniedGet.status,).toBe(404,);
    const deniedPost = await handleDefinitions(db, "POST", worldId, stranger, "user", 1, 20, undefined, {
      name: "X",
    },);
    expect(deniedPost.status,).toBe(404,);
    const missing = await handleDefinitions(db, "GET", uid(), owner, "user", 1, 20,);
    expect(missing.status,).toBe(404,);
  },);

  test("definition GET reflects PUT updates", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Shield", },
    );
    const createdBody: { id: string } = await created.json();

    const fetched = await handleDefinition(db, "GET", worldId, createdBody.id, owner, "user",);
    expect(fetched.status,).toBe(200,);
    const fetchedBody: { name: string } = await fetched.json();
    expect(fetchedBody.name,).toBe("Shield",);

    const updated = await handleDefinition(db, "PUT", worldId, createdBody.id, owner, "user", {
      name: "Aegis",
      properties: { defense: 5, },
    },);
    expect(updated.status,).toBe(200,);
    const updatedBody: { name: string } = await updated.json();
    expect(updatedBody.name,).toBe("Aegis",);
  },);

  test("definition GET/PUT 404 for strangers, missing items, and missing worlds", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Helm", },
    );
    const createdBody: { id: string } = await created.json();

    const denied = await handleDefinition(db, "GET", worldId, createdBody.id, stranger, "user",);
    expect(denied.status,).toBe(404,);
    const missingItem = await handleDefinition(db, "GET", worldId, uid(), owner, "user",);
    expect(missingItem.status,).toBe(404,);
    const missingWorld = await handleDefinition(db, "GET", uid(), createdBody.id, owner, "user",);
    expect(missingWorld.status,).toBe(404,);
    const deniedPut = await handleDefinition(db, "PUT", worldId, createdBody.id, stranger, "user", {
      name: "Z",
    },);
    expect(deniedPut.status,).toBe(404,);
  },);

  test("delete definition wipes rows; strangers are denied", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Doomed", },
    );
    const createdBody: { id: string } = await created.json();
    const denied = await handleDeleteDefinition(db, worldId, createdBody.id, stranger, "user",);
    expect(denied.status,).toBe(404,);
    const deleted = await handleDeleteDefinition(db, worldId, createdBody.id, owner, "user",);
    expect(deleted.status,).toBe(204,);
    const gone = await handleDefinition(db, "GET", worldId, createdBody.id, owner, "user",);
    expect(gone.status,).toBe(404,);
  },);

  test("instances list seeded rows; strangers are denied", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Potion", category: "consumable", },
    );
    const createdBody: { id: string } = await created.json();
    const instanceId = uid();
    await insertWorldItems(db, worldId, createdBody.id, { id: instanceId, } as never,);

    const listed = await handleInstances(db, worldId, createdBody.id, owner, "user",);
    expect(listed.status,).toBe(200,);
    const rows: { id: string }[] = await listed.json();
    expect(rows.some((r,) => r.id === instanceId,),).toBe(true,);

    const denied = await handleInstances(db, worldId, createdBody.id, stranger, "user",);
    expect(denied.status,).toBe(404,);
  },);

  test("transfer and destroy instance round-trip; strangers are denied", async () => {
    const created = await handleDefinitions(
      db,
      "POST",
      worldId,
      owner,
      "user",
      1,
      20,
      undefined,
      { name: "Ring", },
    );
    const createdBody: { id: string } = await created.json();
    const instanceId = uid();
    await insertWorldItems(db, worldId, createdBody.id, { id: instanceId, quantity: 2, } as never,);

    const deniedTransfer = await handleTransfer(db, worldId, instanceId, stranger, "user", {
      quantity: 1,
    },);
    expect(deniedTransfer.status,).toBe(404,);
    const moved = await handleTransfer(db, worldId, instanceId, owner, "user", {
      quantity: 1,
      toActorId: owner,
    },);
    expect(moved.status,).toBe(200,);

    const deniedDestroy = await handleInstance(db, worldId, instanceId, stranger, "user",);
    expect(deniedDestroy.status,).toBe(404,);
    const destroyed = await handleInstance(db, worldId, instanceId, owner, "user",);
    expect(destroyed.status,).toBe(204,);
  },);
});
